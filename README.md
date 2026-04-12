# App thẩm định tài sản

Web app nội bộ mobile-first cho CBTD đi thẩm định tài sản.

## Dùng trên GitHub Pages

App chạy thuần static, nên chỉ cần mở URL GitHub Pages là dùng được.

## Chức năng chính

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

## Lưu ý

- Không có mail server
- Không đăng nhập mail trong web
- Không lưu lịch sử hồ sơ
- Không lưu ảnh lâu dài
- Tất cả ảnh chỉ tồn tại tạm thời trong phiên xử lý

## Chèn logo Agribank

- Đặt file logo tại đường dẫn: `assets/agribank-logo.png`
- Kích thước khuyến nghị: `96x96` hoặc `128x128`, nền trong suốt
- Khi chưa có file logo, app tự hiển thị icon fallback
