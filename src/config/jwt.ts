import jwt from 'jsonwebtoken';
import { JWTPayload } from '@/types/index';
import dotenv from 'dotenv';

// โหลดค่าจาก .env
dotenv.config();

/**
 * JWTService: คลาสสำหรับจัดการ JSON Web Token (JWT) - Updated for Multi-Role
 * - สร้าง Access Token / Refresh Token
 * - ตรวจสอบความถูกต้องและหมดอายุของ Token
 * - ดึงข้อมูลผู้ใช้จาก Token
 * - รองรับ role แบบ array
 */
export class JWTService {
    // กำหนดค่า secret และเวลาหมดอายุของ token จาก environment
    private static JWT_SECRET = process.env.JWT_SECRET || 'JWT_SECRET';
    private static JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'JWT_REFRESH_SECRET';
    private static JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as `${number}d` || '7d';
    private static JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN as `${number}d` || '30d';

    /**
     * สร้าง Access Token
     * @param payload ข้อมูลผู้ใช้ที่จะเก็บใน token (รองรับ role array)
     * @returns JWT access token
     */
    public static generateAccessToken(payload: JWTPayload): string {
        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRES_IN,
            issuer: 'jobhub-api',
            audience: 'jobhub-client'
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
            this.verifyAccessToken(token);
            return false;
        } catch (error: unknown) {
            if (error instanceof Error) {
                return error.message === 'Token expired';
            }
            return false;
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
            if (error instanceof Error) {
                return error.message === 'Refresh token expired';
            }
            return false;
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
     * สร้าง payload สำหรับใช้สร้าง JWT - Updated for Multi-Role
     * - รองรับ role แบบ array
     */
    public static createPayload(userId: string, email: string, role: ('employer' | 'worker' | 'admin')[]): JWTPayload {
        return { 
            userId, 
            email, 
            role: Array.isArray(role) ? role : [role] // ensure it's always an array
        };
    }

    // ==================== NEW METHODS FOR MULTI-ROLE ====================

    /**
     * ดึง roles จาก Access Token
     */
    public static getRolesFromAccessToken(token: string): ('employer' | 'worker' | 'admin')[] | null {
        try {
            const decoded = this.verifyAccessToken(token);
            return decoded.role || null;
        } catch {
            return null;
        }
    }

    /**
     * ตรวจสอบว่า token มี role ที่กำหนดหรือไม่
     */
    public static hasRoleInToken(token: string, targetRole: 'employer' | 'worker' | 'admin'): boolean {
        try {
            const decoded = this.verifyAccessToken(token);
            return decoded.role ? decoded.role.includes(targetRole) : false;
        } catch {
            return false;
        }
    }

    /**
     * ตรวจสอบว่า token มี roles ใดใน array หรือไม่
     */
    public static hasAnyRoleInToken(token: string, targetRoles: ('employer' | 'worker' | 'admin')[]): boolean {
        try {
            const decoded = this.verifyAccessToken(token);
            if (!decoded.role) return false;
            return targetRoles.some(role => decoded.role.includes(role));
        } catch {
            return false;
        }
    }

    /**
     * ตรวจสอบว่า token มีทุก roles ใน array หรือไม่
     */
    public static hasAllRolesInToken(token: string, targetRoles: ('employer' | 'worker' | 'admin')[]): boolean {
        try {
            const decoded = this.verifyAccessToken(token);
            if (!decoded.role) return false;
            return targetRoles.every(role => decoded.role.includes(role));
        } catch {
            return false;
        }
    }

    /**
     * อัปเดต roles ใน payload (สำหรับสร้าง token ใหม่)
     */
    public static updateRolesInPayload(
        originalPayload: JWTPayload, 
        newRoles: ('employer' | 'worker' | 'admin')[]
    ): JWTPayload {
        return {
            ...originalPayload,
            role: newRoles,
            // อัปเดต issued at time
            iat: Math.floor(Date.now() / 1000)
        };
    }

    /**
     * เพิ่ม role ใน payload
     */
    public static addRoleToPayload(
        originalPayload: JWTPayload, 
        newRole: 'employer' | 'worker' | 'admin'
    ): JWTPayload {
        const currentRoles = originalPayload.role || [];
        const updatedRoles = currentRoles.includes(newRole) 
            ? currentRoles 
            : [...currentRoles, newRole];
        
        return this.updateRolesInPayload(originalPayload, updatedRoles);
    }

    /**
     * ลบ role จาก payload
     */
    public static removeRoleFromPayload(
        originalPayload: JWTPayload, 
        roleToRemove: 'employer' | 'worker' | 'admin'
    ): JWTPayload {
        const currentRoles = originalPayload.role || [];
        const updatedRoles = currentRoles.filter(role => role !== roleToRemove);
        
        return this.updateRolesInPayload(originalPayload, updatedRoles);
    }

    // ==================== MIGRATION HELPERS ====================

    /**
     * แปลง legacy token ที่มี role เป็น string เป็น array
     */
    public static migrateLegacyToken(token: string): JWTPayload | null {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET, { 
                ignoreExpiration: true,
                issuer: 'jobhub-api',
                audience: 'jobhub-client'
            }) as any;

            // ถ้า role เป็น string ให้แปลงเป็น array
            if (typeof decoded.role === 'string') {
                decoded.role = [decoded.role];
            }

            // ถ้า role ไม่ใช่ array ให้ใส่ default
            if (!Array.isArray(decoded.role)) {
                decoded.role = ['employer']; // default role
            }

            return decoded as JWTPayload;
        } catch {
            return null;
        }
    }

    /**
     * ตรวจสอบว่า token เป็น format เก่าหรือใหม่
     */
    public static isLegacyToken(token: string): boolean {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET, { 
                ignoreExpiration: true 
            }) as any;
            
            return typeof decoded.role === 'string';
        } catch {
            return false;
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * สร้าง token ใหม่จาก user object
     */
    public static generateTokensFromUser(user: {
        _id: string;
        email: string;
        role: ('employer' | 'worker' | 'admin')[];
    }): { accessToken: string; refreshToken: string } {
        const payload = this.createPayload(user._id, user.email, user.role);
        return this.generateTokens(payload);
    }

    /**
     * ตรวจสอบและ refresh token ถ้าจำเป็น
     */
    public static refreshTokenIfNeeded(
        accessToken: string, 
        refreshToken: string,
        user: { _id: string; email: string; role: ('employer' | 'worker' | 'admin')[]; }
    ): { accessToken: string; refreshToken: string } | null {
        
        // ถ้า access token ยังใช้ได้ ไม่ต้อง refresh
        if (!this.isAccessTokenExpired(accessToken)) {
            return { accessToken, refreshToken };
        }

        // ตรวจสอบ refresh token
        if (this.isRefreshTokenExpired(refreshToken)) {
            return null; // ต้อง login ใหม่
        }

        // สร้าง token ใหม่
        return this.generateTokensFromUser(user);
    }

    /**
     * แยก token จาก Authorization header
     */
    public static extractTokenFromHeader(authHeader: string): string | null {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.substring(7); // ลบ "Bearer " ออก
    }

    /**
     * สร้าง Authorization header
     */
    public static createAuthHeader(token: string): string {
        return `Bearer ${token}`;
    }

    // ==================== DEBUGGING METHODS ====================

    /**
     * ดู payload ของ token โดยไม่ตรวจสอบ expiry
     */
    public static decodeTokenPayload(token: string): JWTPayload | null {
        try {
            return jwt.decode(token) as JWTPayload;
        } catch {
            return null;
        }
    }

    /**
     * ดูข้อมูลครบของ token
     */
    public static getTokenInfo(token: string): {
        payload: JWTPayload | null;
        isValid: boolean;
        isExpired: boolean;
        expiryDate: Date | null;
        roles: string[];
    } {
        const payload = this.decodeTokenPayload(token);
        const isValid = !this.isAccessTokenExpired(token);
        const expiryDate = this.getAccessTokenExpiry(token);
        
        return {
            payload,
            isValid,
            isExpired: this.isAccessTokenExpired(token),
            expiryDate,
            roles: payload?.role || []
        };
    }
}