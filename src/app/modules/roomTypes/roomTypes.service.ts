import httpStatus from 'http-status';
import { IRoomTypes } from './roomTypes.interface';
import RoomTypes from './roomTypes.models';
import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../error/AppError';
import { startSession, Types } from 'mongoose';
import { deleteManyFromS3, uploadManyToS3 } from '../../utils/s3';
import Rooms from '../rooms/rooms.models';
import Property from '../property/property.models';
import { paginationHelper } from '../../helpers/pagination.helpers';
import { BOOKING_MODEL_TYPE } from '../bookings/bookings.interface';
import moment from 'moment';
import Bookings from '../bookings/bookings.models';
import pickQuery from '../../utils/pickQuery';
import generateCryptoString from '../../utils/generateCryptoString';

// const createRoomTypes = async (payload: IRoomTypes, files: any) => {
//   // Start a session for the transaction
//   const session = await startSession();

//   try {
//     // Start the transaction
//     session.startTransaction();

//     if (files) {
//       const { images } = files;

//       if (images?.length) {
//         const imgsArray: { file: any; path: string; key?: string }[] = [];

//         images?.map(async (image: any) => {
//           imgsArray.push({
//             file: image,
//             path: `images/property`,
//           });
//         });

//         payload.images = await uploadManyToS3(imgsArray); // Upload to S3
//       }
//     }

//     // Create the room
//     const result = await RoomTypes.create([payload], { session });

//     if (!result) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create rooms');
//     }
//     if (payload?.totalRooms) {
//       const rooms = Array(payload.totalRooms)
//         .fill(0)
//         .map(() => ({
//           roomNumber: generateCryptoString(5),
//           property: result[0].property,
//           roomCategory: result[0]._id,
//           isActive: true,
//         }));

//       await Rooms.insertMany(rooms, { session });
//     }

//     await session.commitTransaction();

//     return result[0];
//   } catch (error: any) {
//     // If any error occurs, abort the transaction (rollback)
//     await session.abortTransaction();
//     throw new AppError(httpStatus.BAD_REQUEST, error?.message);
//   } finally {
//     // End the session
//     session.endSession();
//   }
// };

const createRoomTypes = async (payload: IRoomTypes, files: any) => {
  const session = await startSession();
  try {
    session.startTransaction();

    // Handle image upload if available
    if (files?.images) {
      const images = Array.isArray(files.images)
        ? files.images
        : [files.images];

      const imgsArray = images.map((image: any) => ({
        file: image,
        path: `images/property`,
      }));

      payload.images = await uploadManyToS3(imgsArray);
    }

    // Create room type
    const [roomType] = await RoomTypes.create([payload], { session });

    if (!roomType) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create room type');
    }

    // Generate and insert individual rooms if totalRooms is provided
    if (payload.totalRooms && (payload?.totalRooms as number) > 0) {
      const rooms = Array.from({ length: payload.totalRooms as number }).map(
        () => ({
          property: roomType.property,
          roomCategory: roomType._id,
          isActive: true,
        }),
      );

      await Rooms.insertMany(rooms, { session });
    }

    await session.commitTransaction();
    return roomType;
  } catch (error: any) {
    await session.abortTransaction();
    throw new AppError(httpStatus.BAD_REQUEST, error?.message);
  } finally {
    session.endSession();
  }
};

const getAllRoomTypes = async (query: Record<string, any>) => {
  const { filters, pagination } = await pickQuery(query);

  const {
    searchTerm,
    facilities,
    priceRange,
    ratingsFilter,
    adults,
    children,
    infants,
    startDate,
    endDate,
    ...filtersData
  } = filters;

  if (filtersData?.author) {
    filtersData['author'] = new Types.ObjectId(filtersData?.author);
  }
  if (filtersData?.property) {
    filtersData['property'] = new Types.ObjectId(filtersData?.property);
  }

  if (filtersData?.facility) {
    filtersData['facility'] = new Types.ObjectId(filtersData?.facility);
  }

  // Initialize the aggregation pipeline
  const pipeline: any[] = [];

  // Add a match to exclude deleted documents
  pipeline.push({
    $match: {
      isDeleted: false,
    },
  });

  // If searchTerm is provided, add a search condition
  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: ['name', 'othersFacilities'].map(field => ({
          [field]: {
            $regex: searchTerm,
            $options: 'i',
          },
        })),
      },
    });
  }

  if (priceRange) {
    const [low, high] = priceRange.split('-').map(Number);

    pipeline.push({
      $match: {
        pricePerNight: { $gte: low, $lte: high },
      },
    });
  }

  if (facilities) {
    const facilitiesArray = facilities
      ?.split(',')
      .map((facility: string) => new Types.ObjectId(facility));
    pipeline.push({
      $match: {
        facilities: { $in: facilitiesArray },
      },
    });
  }

  if (startDate && endDate) {
    const bookedApartments = await Bookings.aggregate([
      {
        $match: {
          modelType: BOOKING_MODEL_TYPE.Rooms,
          isDeleted: false,
          startDate: { $lte: moment(endDate).utc().toDate() }, // booking start <= searchEndDate
          endDate: { $gte: moment(startDate).utc().toDate() }, // booking end >= searchStartDate
        },
      },
      {
        $group: {
          _id: null,
          ids: { $push: { $toString: '$reference' } },
        },
      },
      {
        $project: {
          _id: 0,
          ids: 1,
        },
      },
    ]);
    const idArray =
      bookedApartments[0]?.ids?.map((id: string) => new Types.ObjectId(id)) ||
      [];
    console.log(idArray);
    pipeline.push({
      $match: {
        _id: { $nin: idArray },
      },
    });
  }

  if (adults || children || infants) {
    pipeline.push({
      $match: {
        guests: {
          adult: adults ? { $gte: adults } : { $gte: 0 },
          children: children ? { $gte: children } : { $gte: 0 },
          infants: infants ? { $gte: infants } : { $gte: 0 },
        },
      },
    });
  }
  if (Object.entries(filtersData).length) {
    // Add custom filters (filtersData) to the aggregation pipeline
    Object.entries(filtersData).map(([field, value]) => {
      if (/^\[.*?\]$/.test(value)) {
        const match = value.match(/\[(.*?)\]/);
        const queryValue = match ? match[1] : value;
        pipeline.push({
          $match: {
            [field]: { $in: [new Types.ObjectId(queryValue)] },
          },
        });
        delete filtersData[field];
      }
    });

    if (Object.entries(filtersData).length) {
      pipeline.push({
        $match: {
          $and: Object.entries(filtersData).map(([field, value]) => ({
            isDeleted: false,
            [field]: value,
          })),
        },
      });
    }
  }

  // Sorting condition
  const { page, limit, skip, sort } =
    paginationHelper.calculatePagination(pagination);

  if (sort) {
    const sortArray = sort.split(',').map(field => {
      const trimmedField = field.trim();
      if (trimmedField.startsWith('-')) {
        return { [trimmedField.slice(1)]: -1 };
      }
      return { [trimmedField]: 1 };
    });

    pipeline.push({ $sort: Object.assign({}, ...sortArray) });
  }

  pipeline.push({
    $facet: {
      totalData: [{ $count: 'total' }],
      paginatedData: [
        { $skip: skip },
        { $limit: limit },
        // Lookups
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author',
            pipeline: [
              {
                $project: {
                  name: 1,
                  email: 1,
                  phoneNumber: 1,
                  profile: 1,
                },
              },
            ],
          },
        },

        {
          $lookup: {
            from: 'facilities',
            localField: 'facilities',
            foreignField: '_id',
            as: 'facilities',
          },
        },

        {
          $addFields: {
            author: { $arrayElemAt: ['$author', 0] }, 
          },
        },
      ],
    },
  });

  const [result] = await RoomTypes.aggregate(pipeline);

  const total = result?.totalData?.[0]?.total || 0;
  const data = result?.paginatedData || [];

  return {
    meta: { page, limit, total },
    data,
  };
};

const getRoomTypesById = async (id: string) => {
  const result = await RoomTypes.findById(id).populate([
    { path: 'property' },
    { path: 'author', select: 'name email phoneNumber profile role' },
    { path: 'facilities' },
  ]);
  if (!result || result?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Rooms not found!');
  }
  return result;
};

const updateRoomTypes = async (
  id: string,
  payload: Partial<IRoomTypes>,
  files: any,
) => {
  const { deleteKey, ...updateData } = payload;

  const update: any = { ...updateData };

  if (files) {
    const { images } = files;

    if (images?.length) {
      const imgsArray: { file: any; path: string; key?: string }[] = [];

      images.map((image: any) =>
        imgsArray.push({
          file: image,
          path: `images/rooms`,
        }),
      );

      payload.images = await uploadManyToS3(imgsArray);
    }
  }

  if (deleteKey && deleteKey.length > 0) {
    const newKey: string[] = [];
    deleteKey.map((key: any) => newKey.push(`images/rooms${key}`));
    if (newKey?.length > 0) {
      await deleteManyFromS3(newKey);
    }

    await RoomTypes.findByIdAndUpdate(id, {
      $pull: { banner: { key: { $in: deleteKey } } },
    });
  }

  if (payload?.images && payload.images.length > 0) {
    await RoomTypes.findByIdAndUpdate(id, {
      $push: { banner: { $each: payload.images } },
    });
  }

  const result = await RoomTypes.findByIdAndUpdate(id, update, { new: true });
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Rooms');
  }
  return result;
};

const deleteRoomTypes = async (id: string) => {
  const result = await Rooms.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  );
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete rooms');
  }
  return result;
};

export const roomTypesService = {
  createRoomTypes,
  getAllRoomTypes,
  getRoomTypesById,
  updateRoomTypes,
  deleteRoomTypes,
};
