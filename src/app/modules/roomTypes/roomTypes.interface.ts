import { Model, ObjectId } from 'mongoose';
import { IImage, IProperty } from '../property/property.interface';
import { IUser } from '../user/user.interface';
import { IFacilities } from '../facilities/facilities.interface';

export interface IRoomTypes {
  deleteKey?: string[];
  totalRooms: Number;
  roomType: string;
  property: ObjectId | IProperty;
  author: ObjectId | IUser;
  pricePerNight: number;
  roomSpace: Number;
  bedDetails: string;
  guests: { adult: number; children: number; infants: number };
  facilities: ObjectId[] | IFacilities[];
  otherFacilities: string[];
  customerChoices: string;
  descriptions: string;
  shortDescriptions: string;
  policy: string;
  isDeleted: boolean;
  images: IImage[];
}

export type IRoomTypesModules = Model<IRoomTypes, Record<string, unknown>>;
