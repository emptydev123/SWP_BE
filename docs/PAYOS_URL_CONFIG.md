# Hướng dẫn Config PayOS URLs

## 1. Webhook URL (QUAN TRỌNG NHẤT)

### Cách config:
1. **Trong PayOS Dashboard:**
   - Vào **"Thông tin tích hợp"** (Integration Information)
   - Tìm mục **"Webhook Url"**
   - Điền URL: `https://your-ngrok-url.ngrok-free.dev/api/transactions/webhook`

### Ví dụ với ngrok của bạn:
```
https://unprospered-melita-pseudoapologetically.ngrok-free.dev/api/transactions/webhook
```

### Lưu ý:
- ✅ **PHẢI** là public URL (không thể dùng localhost)
- ✅ Phải có `/api/transactions/webhook` ở cuối
- ✅ PayOS sẽ tự động gọi URL này khi có thay đổi trạng thái thanh toán
- ⚠️ Mỗi lần restart ngrok, URL sẽ thay đổi → phải update lại trong PayOS Dashboard

---

## 2. Return URL & Cancel URL (trong .env)

### Cách config trong `.env`:

#### Option 1: Dùng ngrok (cho test với PayOS thật)
```env
# PayOS URLs
PAYOS_RETURN_URL="https://unprospered-melita-pseudoapologetically.ngrok-free.dev/api/transactions/return"
PAYOS_CANCEL_URL="https://unprospered-melita-pseudoapologetically.ngrok-free.dev/api/transactions/cancel"
```

#### Option 2: Dùng localhost (chỉ cho test local, PayOS không thể redirect về được)
```env
# PayOS URLs (Local development)
PAYOS_RETURN_URL="http://localhost:5001/api/transactions/return"
PAYOS_CANCEL_URL="http://localhost:5001/api/transactions/cancel"
```

#### Option 3: Không set (dùng default trong code)
- Nếu không set trong `.env`, code sẽ dùng default: `http://localhost:3000/...`
- ⚠️ **Lưu ý:** Default port là 3000, nhưng server bạn chạy port 5001 → nên set trong `.env`

---

## 3. Cấu hình đầy đủ trong .env

Thêm vào file `.env` của bạn:

```env
# PayOS Configuration (đã có)
PAYOS_CLIENT_ID=6799797b-c5fe-4247-a939-ea991cca3bb2
PAYOS_API_KEY=e197ee0a-332d-4b9f-9f7a-fd1f64e41a4b
PAYOS_CHECKSUM_KEY=47335acc906155e24aa88d22dc7aa915c6b58f70e8b94199d4893bb9aa5cf6e8

# PayOS URLs (thêm vào)
# Dùng ngrok URL khi test với PayOS thật
PAYOS_RETURN_URL="https://unprospered-melita-pseudoapologetically.ngrok-free.dev/api/transactions/return"
PAYOS_CANCEL_URL="https://unprospered-melita-pseudoapologetically.ngrok-free.dev/api/transactions/cancel"

# Hoặc dùng localhost (chỉ cho test local)
# PAYOS_RETURN_URL="http://localhost:5001/api/transactions/return"
# PAYOS_CANCEL_URL="http://localhost:5001/api/transactions/cancel"
```

---

## 4. So sánh các URL

| URL | Config ở đâu? | Ví dụ | Mục đích |
|-----|---------------|-------|----------|
| **Webhook URL** | PayOS Dashboard | `https://ngrok-url/api/transactions/webhook` | PayOS gọi đến server khi có thay đổi |
| **Return URL** | `.env` file | `https://ngrok-url/api/transactions/return` | User redirect về sau khi thanh toán thành công |
| **Cancel URL** | `.env` file | `https://ngrok-url/api/transactions/cancel` | User redirect về khi hủy thanh toán |

---

## 5. Flow hoạt động

### Khi user thanh toán:
1. User click payment link → PayOS payment page
2. User thanh toán thành công → PayOS gọi **Webhook URL** (tự động)
3. PayOS redirect user về **Return URL** (user thấy thông báo)

### Khi user hủy:
1. User click "Hủy" → PayOS redirect về **Cancel URL**

---

## 6. Lưu ý quan trọng

### Webhook URL:
- ✅ **BẮT BUỘC** phải config trong PayOS Dashboard
- ✅ Phải là public URL (dùng ngrok)
- ✅ Đây là cách **DUY NHẤT** để server biết thanh toán đã thành công

### Return/Cancel URL:
- ⚠️ Nếu dùng localhost, PayOS **KHÔNG THỂ** redirect về được
- ✅ Nên dùng ngrok URL khi test với PayOS thật
- ✅ Có thể là frontend page (không nhất thiết là backend API)

---

## 7. Test Webhook

Sau khi config xong:

1. Tạo một payment link
2. Thanh toán thử
3. Kiểm tra logs trong terminal xem có nhận được webhook không
4. Kiểm tra database xem transaction status đã được cập nhật chưa

Nếu không nhận được webhook:
- Kiểm tra URL trong PayOS Dashboard có đúng không
- Kiểm tra ngrok có đang chạy không
- Kiểm tra server có đang chạy trên port đúng không

