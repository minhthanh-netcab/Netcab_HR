-- AlterTable: bố cục trang Tổng quan theo từng tài khoản (null = bố cục mặc định)
ALTER TABLE "User" ADD COLUMN "dashboardLayout" JSONB;
