import { Response } from 'express';
import { ApiResponse } from '@/types/typese';

/**
 * คลาส ResponseHelper สำหรับช่วยจัดการการตอบกลับ API
 * รวมฟังก์ชันสำหรับส่ง response แบบ success, error, validation, pagination ฯลฯ
 * ใช้ลดการเขียนโค้ดซ้ำใน controller
 */
export class ResponseHelper {
  /**
   * ส่ง response กรณีสำเร็จ
   * สามารถแนบข้อมูล data และ pagination ได้
   */
  success<T>(
    res: Response,
    message: string,
    data?: T,
    statusCode: number = 200,
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      message,
      ...(data !== undefined && { data }),       // ใส่ data เฉพาะถ้ามี
      ...(pagination && { pagination })          // ใส่ pagination เฉพาะถ้ามี
    };

    res.status(statusCode).json(response);
  }

  /**
   * ส่ง response กรณี error
   * สามารถแนบข้อมูล error และ data เพิ่มเติมได้
   */
  error(
    res: Response,
    message: string,
    statusCode: number = 500,
    data?: any
  ): void {
    const response: ApiResponse = {
      success: false,
      message,
      error: message,
      ...(data && { data })
    };

    res.status(statusCode).json(response);
  }

  /**
   * ส่ง response กรณีสร้างข้อมูลสำเร็จ (HTTP 201)
   */
  created<T>(
    res: Response,
    message: string,
    data?: T
  ): void {
    this.success(res, message, data, 201);
  }

  /**
   * ส่ง response กรณีไม่มีข้อมูล (HTTP 204)
   */
  noContent(res: Response): void {
    res.status(204).send();
  }

  /**
   * ส่ง response กรณีไม่ได้รับอนุญาต (HTTP 401)
   */
  unauthorized(res: Response, message: string = 'Unauthorized'): void {
    this.error(res, message, 401);
  }

  /**
   * ส่ง response กรณีถูกปฏิเสธสิทธิ์ (HTTP 403)
   */
  forbidden(res: Response, message: string = 'Forbidden'): void {
    this.error(res, message, 403);
  }

  /**
   * ส่ง response กรณีไม่พบ resource (HTTP 404)
   */
  notFound(res: Response, message: string = 'Resource not found'): void {
    this.error(res, message, 404);
  }

  /**
   * ส่ง response กรณีข้อมูลซ้ำกัน (HTTP 409)
   */
  conflict(res: Response, message: string = 'Resource conflict'): void {
    this.error(res, message, 409);
  }

  /**
   * ส่ง response กรณี validation error (HTTP 400)
   * แนบ errors array
   */
  validationError(res: Response, errors: any[], message: string = 'Validation failed'): void {
    this.error(res, message, 400, { errors });
  }

  /**
   * ส่ง response แบบมีข้อมูลแบ่งหน้า (pagination)
   */
  paginated<T>(
    res: Response,
    message: string,
    data: T[],
    page: number,
    limit: number,
    total: number
  ): void {
    const totalPages = Math.ceil(total / limit);
    
    this.success(res, message, data, 200, {
      page,
      limit,
      total,
      totalPages
    });
  }

  /**
   * ส่ง response พร้อม meta ข้อมูลเพิ่มเติม
   */
  withMeta<T>(
    res: Response,
    message: string,
    data: T,
    meta: Record<string, any>,
    statusCode: number = 200
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      meta
    };

    res.status(statusCode).json(response);
  }

  /**
   * ส่ง response กรณี login/signup สำเร็จ พร้อม user และ token
   */
  authSuccess<T>(
    res: Response,
    message: string,
    user: T,
    tokens: {
      accessToken: string;
      refreshToken: string;
    }
  ): void {
    this.success(res, message, {
      user,
      tokens
    });
  }

  /**
   * ส่ง response กรณี upload ไฟล์สำเร็จ
   */
  fileUploadSuccess(
    res: Response,
    message: string,
    fileInfo: {
      filename: string;
      originalName: string;
      size: number;
      mimetype: string;
      url: string;
    }
  ): void {
    this.success(res, message, fileInfo);
  }

  /**
   * ส่ง response กรณีถูกจำกัด rate limit (HTTP 429)
   */
  rateLimited(
    res: Response,
    message: string = 'Too many requests',
    retryAfter?: number
  ): void {
    if (retryAfter) {
      res.set('Retry-After', retryAfter.toString());
    }
    this.error(res, message, 429);
  }

  /**
   * ส่ง response กรณีระบบปิดปรับปรุง (HTTP 503)
   */
  maintenance(res: Response, message: string = 'Service temporarily unavailable'): void {
    this.error(res, message, 503);
  }
}

// Export singleton instance
// ใช้ responseHelper ได้เลย ไม่ต้อง new ทุกครั้ง
export const responseHelper = new ResponseHelper();