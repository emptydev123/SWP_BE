# Giải thích về PayOS URLs

## Tổng quan

Có 3 loại URL khác nhau trong tích hợp PayOS:

1. **Webhook URL** - Config trong PayOS Dashboard
2. **Return URL** - Config trong code (.env)
3. **Cancel URL** - Config trong code (.env)

---

## 1. Webhook URL

### Là gì?
- **Webhook URL** là endpoint mà **PayOS gọi đến server của bạn** khi có thay đổi trạng thái thanh toán
- PayOS gửi POST request đến URL này **tự động** (không phải user click)
- Đây là cách **duy nhất đáng tin cậy** để biết thanh toán đã thành công hay thất bại

### Cách config:
1. Vào **PayOS Dashboard** → **Thông tin tích hợp** (Integration Information)
2. Tìm mục **"Webhook url"**
3. Điền URL của bạn: `https://your-domain.com/api/transactions/webhook`
   - **Production**: `https://yourdomain.com/api/transactions/webhook`
   - **Development**: Có thể dùng ngrok: `https://abc123.ngrok.io/api/transactions/webhook`

### Flow:
```
User thanh toán → PayOS xử lý → PayOS gọi Webhook URL → Server cập nhật transaction
```

### Lưu ý:
- **KHÔNG** config trong `.env` file
- Phải là **public URL** (không thể dùng localhost trực tiếp)
- PayOS sẽ verify signature để đảm bảo request hợp lệ

---

## 2. Return URL

### Là gì?
- **Return URL** là trang mà **user được redirect đến** sau khi thanh toán thành công
- User click vào link này sau khi hoàn tất thanh toán trên PayOS
- Dùng để **hiển thị thông báo thành công** cho user

### Cách config:
Trong file `.env`:
```env
PAYOS_RETURN_URL="https://your-domain.com/api/transactions/return"
```

Hoặc trong code (đã có default):
```javascript
// services/payosService.js
this.returnUrl = process.env.PAYOS_RETURN_URL || 'http://localhost:3000/api/transactions/return';
```

### Flow:
```
User thanh toán thành công → PayOS redirect → Return URL → User thấy thông báo thành công
```

### Lưu ý:
- Được gửi trong request body khi tạo payment link
- Có thể là **localhost** nếu test local
- Thường là **frontend page** để hiển thị kết quả cho user

---

## 3. Cancel URL

### Là gì?
- **Cancel URL** là trang mà **user được redirect đến** khi hủy thanh toán
- User click vào link này khi không muốn thanh toán nữa
- Dùng để **hiển thị thông báo hủy** cho user

### Cách config:
Trong file `.env`:
```env
PAYOS_CANCEL_URL="https://your-domain.com/api/transactions/cancel"
```

Hoặc trong code (đã có default):
```javascript
// services/payosService.js
this.cancelUrl = process.env.PAYOS_CANCEL_URL || 'http://localhost:3000/api/transactions/cancel';
```

### Flow:
```
User hủy thanh toán → PayOS redirect → Cancel URL → User thấy thông báo hủy
```

### Lưu ý:
- Được gửi trong request body khi tạo payment link
- Có thể là **localhost** nếu test local
- Thường là **frontend page** để hiển thị kết quả cho user

---

## So sánh

| Loại URL | Ai gọi? | Khi nào? | Mục đích | Config ở đâu? |
|----------|---------|----------|----------|---------------|
| **Webhook URL** | PayOS server | Tự động khi có thay đổi | Cập nhật DB, xử lý business logic | PayOS Dashboard |
| **Return URL** | User browser | Sau khi thanh toán thành công | Hiển thị thông báo cho user | `.env` file |
| **Cancel URL** | User browser | Khi user hủy thanh toán | Hiển thị thông báo hủy cho user | `.env` file |

---

## Ví dụ thực tế

### Development (Local):
```env
# .env
PAYOS_RETURN_URL="http://localhost:3000/api/transactions/return"
PAYOS_CANCEL_URL="http://localhost:3000/api/transactions/cancel"
```

**Webhook URL trong PayOS Dashboard:**
- Dùng **ngrok** để expose local server:
  ```
  ngrok http 3000
  → https://abc123.ngrok.io/api/transactions/webhook
  ```

### Production:
```env
# .env
PAYOS_RETURN_URL="https://yourdomain.com/payment/success"
PAYOS_CANCEL_URL="https://yourdomain.com/payment/cancel"
```

**Webhook URL trong PayOS Dashboard:**
```
https://yourdomain.com/api/transactions/webhook
```

---

## Quan trọng!

1. **Webhook URL** là **BẮT BUỘC** và **QUAN TRỌNG NHẤT**
   - Đây là cách duy nhất để server biết thanh toán đã thành công
   - Return/Cancel URL chỉ để hiển thị cho user, không đáng tin cậy 100%

2. **Return/Cancel URL** có thể là frontend pages
   - Không nhất thiết phải là backend API
   - Có thể là: `https://yourdomain.com/payment/success`

3. **Webhook phải là public URL**
   - Không thể dùng localhost trực tiếp
   - Phải dùng ngrok hoặc deploy lên server

---

## Kiểm tra Webhook hoạt động

1. Thanh toán thử một giao dịch
2. Kiểm tra logs trong server xem có nhận được webhook không
3. Kiểm tra database xem transaction status đã được cập nhật chưa
4. Nếu không nhận được webhook, kiểm tra:
   - URL có đúng không?
   - Server có public không?
   - Firewall có block không?
   - PayOS Dashboard có config đúng không?

