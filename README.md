# App thẩm định tài sản

Web app nội bộ mobile-first cho CBTD đi thẩm định tài sản.

## Chức năng

- Nhập thông tin hồ sơ
- Tự sinh mã hồ sơ theo ngày giờ và tên viết tắt CBTD
- Chọn nhiều ảnh từ điện thoại
- Nén ảnh tự động ngay trên trình duyệt
- Tính tổng dung lượng sau nén
- Cảnh báo khi vượt ngưỡng gửi an toàn
- Tự chia ảnh thành nhiều phần để gửi lần lượt
- Chuẩn bị sẵn subject và body cho từng phần
- Mở bảng chia sẻ của điện thoại để bàn giao sang Gmail, Outlook, Apple Mail hoặc ứng dụng mail khác
- Fallback: copy subject/body và tải ảnh phần đó về máy nếu thiết bị không hỗ trợ share files

## Chạy local

```bash
npm start
```

Mở `http://localhost:3000`.

## Đưa lên GitHub để dùng online

App này là static web app, nên có thể đưa lên GitHub Pages để dùng qua URL HTTPS.

### Cách làm

1. Tạo một repo GitHub mới.
2. Push toàn bộ source lên repo đó.
3. Vào `Settings` -> `Pages`.
4. Chọn source là branch `main` và folder `/root`.
5. Lưu lại và đợi GitHub tạo link Pages.

### Lưu ý

- App dùng `navigator.share`, nên chạy trên HTTPS sẽ ổn hơn localhost.
- Khi dùng GitHub Pages, đường dẫn asset phải là tương đối. Tôi đã đổi sẵn sang `./styles.css` và `./app.js`.
- Không cần backend để gửi mail, vì app chỉ chuẩn bị ảnh và nội dung rồi mở app mail trên điện thoại.

## Lưu ý

- Không có mail server
- Không đăng nhập mail trong web
- Không lưu lịch sử hồ sơ
- Không lưu ảnh lâu dài
- Tất cả ảnh chỉ tồn tại tạm thời trong phiên xử lý
