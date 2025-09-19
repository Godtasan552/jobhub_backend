import {Document} from 'mongoose';
import { Request } from 'express';

// UserTypes
export interface IUser extends Document {
    _id: string ; // _ ข้างหน้า = บอกว่า private/internal, ไม่ควรเข้าถึงตรง ๆ
    name: string;
    email: string;
    passwordHash: string;
    wallet: number;
    role: 'employee' | 'worker';
    skills: string[];
    ceategories: string[];
    profilePicture?: string;
    about?: string;
    phoone?: string;
    location?: string;
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}