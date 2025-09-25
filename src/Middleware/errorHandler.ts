import { Request, Response, NextFunction } from 'express';
import { responseHelper } from '@/utils/responseHelper';

export class AppError extends Error {
  // สร้าง custom error class ของเราเอง
  statusCode: number;  // รหัสสถานะ HTTP
  isOperational: boolean; // ใช้บอกว่า error นี้เป็น predictable หรือ unexpected
  data?: any; // ข้อมูลเพิ่มเติมเกี่ยวกับ error

  constructor(message: string, statusCode: number = 500, data?: any) {
    // รับ message, statusCode, และ data
    super(message); // เรียก constructor ของ Error
    this.statusCode = statusCode; // กำหนด statusCode
    this.isOperational = true; // กำหนดว่าเป็น operational error
    this.data = data; // กำหนด data เพิ่มเติม

    Error.captureStackTrace(this, this.constructor);
    // เก็บ stack trace ของ error
  }
}

/**
 * Global error handler middleware
 * middleware สำหรับจัดการ error ทั้งหมดในแอป
 */
export const globalErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let err = { ...error }; // clone error object
  err.message = error.message; // เก็บข้อความ error
  err.stack = error.stack; // เก็บ stack trace

  // Log error ลง console
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl, // URL ที่เกิด error
    method: req.method, // HTTP method
    ip: req.ip, // IP ผู้ใช้
    userAgent: req.get('User-Agent'), // user agent
    timestamp: new Date().toISOString() // เวลาที่เกิด error
  });

  // จัดการ Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = 'Validation Error'; // ข้อความ error
    const errors = Object.values(err.errors).map((val: any) => ({
      field: val.path, // field ที่ผิด
      message: val.message, // ข้อความ error
      value: val.value // ค่าที่ส่งมา
    }));
    err = new AppError(message, 400, { errors }); // แปลงเป็น AppError
  }

  // จัดการ Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]; // field ที่ซ้ำ
    const value = err.keyValue[field]; // ค่าที่ซ้ำ
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`;
    err = new AppError(message, 409); // แปลงเป็น AppError
  }

  // จัดการ Mongoose cast error (เช่น ObjectId ไม่ถูกต้อง)
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`;
    err = new AppError(message, 400);
  }

  // จัดการ JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    err = new AppError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    err = new AppError(message, 401);
  }

  // จัดการ Multer errors (เกี่ยวกับ file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    err = new AppError(message, 413);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Too many files';
    err = new AppError(message, 413);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    err = new AppError(message, 400);
  }

  // ส่ง error response
  if (err.isOperational || err instanceof AppError) {
    // กรณี predictable error
    responseHelper.error(
      res,
      err.message, // ข้อความ error
      err.statusCode || 500, // statusCode
      process.env.NODE_ENV === 'development' ? {
        error: err,
        stack: err.stack,
        data: err.data
      } : err.data
    );
  } else {
    // กรณี programming error หรือ unknown error
    responseHelper.error(
      res,
      process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
      500,
      process.env.NODE_ENV === 'development' ? {
        error: err,
        stack: err.stack
      } : undefined
    );
  }
};

/**
 * Catch async errors wrapper
 * wrapper สำหรับจับ error ของ async function
 */
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
    // ถ้าเกิด error จะส่งต่อไป globalErrorHandler
  };
};

/**
 * Handle 404 errors
 * middleware สำหรับจัดการ route ที่ไม่พบ
 */
export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error); // ส่ง error ต่อไปให้ globalErrorHandler
};

/**
 * Handle uncaught exceptions
 * จัดการ uncaught exceptions ที่ไม่ได้ถูกจับ
 */
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (err: Error) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message, err.stack); // log ข้อมูล error
    process.exit(1); // ปิด process
  });
};

/**
 * Handle unhandled promise rejections
 * จัดการ unhandled promise rejections
 */
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (err: Error) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message); // log error
    process.exit(1); // ปิด process
  });
};

/**
 * Graceful shutdown handler
 * จัดการปิด server อย่างเรียบร้อยเมื่อรับ signal
 */
export const setupGracefulShutdown = (server: any): void => {
  const gracefulShutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    
    server.close(() => {
      console.log('💥 Process terminated!');
      process.exit(0); // ปิด process หลังปิด server เรียบร้อย
    });

    // Force close หลัง 30 วินาที
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  // รอรับ signal จาก OS และเรียก shutdown
};
