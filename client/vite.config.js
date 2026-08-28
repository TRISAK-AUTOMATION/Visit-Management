import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// วิธีใช้งาน:
// - Dev:  npm run dev   (รันที่ localhost:5173 และ proxy /api ไปยัง Express ที่ localhost:3000)
//         ต้องรัน Express (npm start ที่โฟลเดอร์หลัก) ควบคู่กันไปด้วยอีกหน้าต่างหนึ่ง
// - Build: npm run build (ได้ไฟล์ static ออกไปที่ ../public ให้ Express serve ต่อได้ทันที)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true
  }
});
