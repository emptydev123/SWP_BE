# Hướng dẫn Debug PayOS API

## Lỗi thường gặp: "getaddrinfo ENOTFOUND api.payos.vn"

**LƯU Ý QUAN TRỌNG:** Hệ thống hiện tại sử dụng package `@payos/node` để tự động xử lý kết nối và URL. Package này sẽ tự động xử lý DNS và kết nối, không cần phải cấu hình `PAYOS_BASE_URL` nữa.

Nếu vẫn gặp lỗi DNS, thử các cách sau:

### 1. Kiểm tra PayOS Credentials

Đảm bảo các biến sau đã được set đầy đủ trong `.env`:
```env
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
PAYOS_CHECKSUM_KEY=your-checksum-key
```

**KHÔNG CẦN** `PAYOS_BASE_URL` vì package `@payos/node` tự động xử lý.

#### Option 2: Kiểm tra kết nối mạng
Chạy lệnh sau để test kết nối:
```bash
# Windows PowerShell
Test-NetConnection api.payos.vn -Port 443

# Hoặc dùng curl
curl -I https://api.payos.vn/v2/payment-requests
```

#### Option 3: Kiểm tra Firewall/Proxy
- Đảm bảo firewall không block kết nối đến `api.payos.vn`
- Nếu đang dùng proxy, cấu hình axios để dùng proxy

### 2. Kiểm tra PayOS Credentials

Đảm bảo các biến sau đã được set trong `.env`:
```env
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
PAYOS_CHECKSUM_KEY=your-checksum-key
```

### 3. Kiểm tra Logs

Khi gọi PayOS API, hệ thống sẽ log thông tin chi tiết:
- URL được gọi
- Order code
- Amount
- Có credentials hay không

Kiểm tra console logs để xem thông tin chi tiết.

### 4. Test PayOS API trực tiếp

Có thể test PayOS API bằng curl:

```bash
curl -X POST https://api.payos.vn/v2/payment-requests \
  -H "Content-Type: application/json" \
  -H "x-client-id: YOUR_CLIENT_ID" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "orderCode": 1234567890,
    "amount": 50000,
    "description": "Test payment",
    "items": [{"name": "Test", "quantity": 1, "price": 50000}],
    "cancelUrl": "https://your-url.com/cancel",
    "returnUrl": "https://your-url.com/return",
    "expiredAt": 1735689600
  }'
```

### 5. Các lỗi thường gặp và cách fix

#### Lỗi: "getaddrinfo ENOTFOUND api.payos.vn"
**Nguyên nhân:** DNS không resolve được domain `api.payos.vn`

**Cách fix:**
1. Kiểm tra kết nối internet
2. Kiểm tra DNS settings
3. Thử dùng DNS khác (8.8.8.8 hoặc 1.1.1.1)
4. Kiểm tra firewall/proxy

#### Lỗi: "ECONNREFUSED"
**Nguyên nhân:** Không thể kết nối đến server

**Cách fix:**
1. Kiểm tra URL có đúng không
2. Kiểm tra firewall
3. Kiểm tra PayOS có đang maintenance không

#### Lỗi: "ETIMEDOUT"
**Nguyên nhân:** Request timeout

**Cách fix:**
1. Kiểm tra kết nối mạng
2. Thử lại sau vài phút
3. Kiểm tra PayOS service status

### 6. Error Handling đã được cải thiện

Hệ thống đã được cập nhật để:
- Tự động update transaction status thành `FAILED` nếu PayOS API fail
- Tự động update tickets status thành `CANCELLED` nếu PayOS API fail
- Log chi tiết lỗi để dễ debug

### 7. Liên hệ PayOS Support

Nếu vẫn gặp vấn đề:
1. Kiểm tra PayOS Dashboard: https://pay.payos.vn/web4/
2. Xem PayOS Documentation: https://payos.vn/docs/
3. Liên hệ PayOS Support nếu cần

