import { model, Schema, Types } from 'mongoose';
import { IRooms, IRoomsModules } from './rooms.interface';
import { IImage } from './../property/property.interface';

 

const roomsSchema = new Schema<IRooms>(
  {
    roomNumber: {
      type: String,
      default: null,
    },
    property: {
      type: Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    roomType: {
      type: Types.ObjectId,
      ref: 'RoomTypes',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Rooms = model<IRooms, IRoomsModules>('Rooms', roomsSchema);
export default Rooms;
