
import { model, Schema } from 'mongoose';
import { IPayments, IPaymentsModules } from './payments.interface';

const paymentsSchema = new Schema<IPayments>(
  {
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

 

const Payments = model<IPayments, IPaymentsModules>(
  'Payments',
  paymentsSchema
);
export default Payments;