import jwt from 'jsonwebtoken';
import { JWTPayload } from '@/types/typese';
import dotenv from 'dotenv';

// โหลดค่าจาก .env
dotenv.config();

/**
 * JWTService: คลาสสำหรับจัดการ JSON Web Token (JWT)
 * - สร้าง Access Token / Refresh Token
 * - ตรวจสอบความถูกต้องและหมดอายุของ Token
 * - ดึงข้อมูลผู้ใช้จาก Token
 */
export class JWTService {
    // กำหนดค่า secret และเวลาหมดอายุของ token จาก environment
    private static JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    private static JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    private static JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as `${number}d` || '7d';
    private static JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN as `${number}d` || '30d';


    /**
     * สร้าง Access Token
     * @param payload ข้อมูลผู้ใช้ที่จะเก็บใน token
     * @returns JWT access token
     */
    public static generateAccessToken(payload: JWTPayload): string {
        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRES_IN,  // กำหนดอายุ token
            issuer: 'jobhub-api',             // ระบุผู้สร้าง token
            audience: 'jobhub-client'         // ระบุผู้ใช้ token
        });
    }

    /**
     * สร้าง Refresh Token
     * ใช้สำหรับขอ access token ใหม่เมื่อ access token หมดอายุ
     */
    public static generateRefreshToken(payload: JWTPayload): string {
        return jwt.sign(payload, this.JWT_REFRESH_SECRET, {
            expiresIn: this.JWT_REFRESH_EXPIRES_IN,
            issuer: 'jobhub-api',
            audience: 'jobhub-client'
        });
    }

    /**
     * สร้างทั้ง Access Token และ Refresh Token พร้อมกัน
     */
    public static generateTokens(payload: JWTPayload): { accessToken: string; refreshToken: string } {
        return {
            accessToken: this.generateAccessToken(payload),
            refreshToken: this.generateRefreshToken(payload)
        };
    }

    /**
     * ตรวจสอบความถูกต้องของ Access Token
     * - ถ้า token ถูกต้อง จะคืนค่า payload
     * - ถ้า token หมดอายุหรือไม่ถูกต้อง จะ throw error
     */
    public static verifyAccessToken(token: string): JWTPayload {
        try {
            return jwt.verify(token, this.JWT_SECRET, {
                issuer: 'jobhub-api',
                audience: 'jobhub-client'
            }) as JWTPayload;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) throw new Error('Token expired');
            if (error instanceof jwt.JsonWebTokenError) throw new Error('Invalid token');
            throw new Error('Token verification failed');
        }
    }

    /**
     * ตรวจสอบความถูกต้องของ Refresh Token
     */
    public static verifyRefreshToken(token: string): JWTPayload {
        try {
            return jwt.verify(token, this.JWT_REFRESH_SECRET, {
                issuer: 'jobhub-api',
                audience: 'jobhub-client'
            }) as JWTPayload;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) throw new Error('Refresh token expired');
            if (error instanceof jwt.JsonWebTokenError) throw new Error('Invalid refresh token');
            throw new Error('Refresh token verification failed');
        }
    }

    /**
     * ตรวจสอบว่า Access Token หมดอายุหรือไม่
     * - คืนค่า true ถ้าหมดอายุ, false ถ้าใช้ได้
     */
    public static isAccessTokenExpired(token: string): boolean {
        try {
            this.verifyAccessToken(token); // verify จะ throw ถ้าหมดอายุ
            return false;
        } catch (error: unknown) {
            if (error instanceof Error) { // ตรวจสอบว่าเป็น Error object
                return error.message === 'Token expired';
            }
            return false; // ถ้าไม่ใช่ Error ให้คืน false
        }
    }


    /**
     * ตรวจสอบว่า Refresh Token หมดอายุหรือไม่
     */
    public static isRefreshTokenExpired(token: string): boolean {
        try {
            this.verifyRefreshToken(token);
            return false;
        } catch (error: unknown) {
            if (error instanceof Error) { // ตรวจสอบว่าเป็น Error object
                return error.message === 'Refresh token expired';
            }
            return false; // ถ้าไม่ใช่ Error ให้คืน false
        }
    }

    /**
     * ดึงวันหมดอายุของ Access Token
     * - ใช้ ignoreExpiration เพื่อดูเวลา expiry โดยไม่สนใจ token หมดอายุแล้ว
     */
    public static getAccessTokenExpiry(token: string): Date | null {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET, { ignoreExpiration: true }) as JWTPayload & { exp: number };
            return decoded.exp ? new Date(decoded.exp * 1000) : null;
        } catch {
            return null;
        }
    }

    /**
     * ดึงวันหมดอายุของ Refresh Token
     */
    public static getRefreshTokenExpiry(token: string): Date | null {
        try {
            const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET, { ignoreExpiration: true }) as JWTPayload & { exp: number };
            return decoded.exp ? new Date(decoded.exp * 1000) : null;
        } catch {
            return null;
        }
    }

    /**
     * ดึง userId จาก Access Token
     */
    public static getUserIdFromAccessToken(token: string): string | null {
        try {
            const decoded = this.verifyAccessToken(token);
            return decoded.userId || null;
        } catch {
            return null;
        }
    }

    /**
     * สร้าง payload สำหรับใช้สร้าง JWT
     * - ใช้ลดความซ้ำซ้อนเวลาสร้าง token หลายๆ ที่
     */
    public static createPayload(userId: string, email: string, role: string): JWTPayload {
        return { userId, email, role };
    }
}
