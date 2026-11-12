export const authCopy = {
  brandHome: 'AnimeFork, trang chủ',
  panel: {
    label: 'Giới thiệu',
    headline: 'Unlimited anime, no ads',
    subline: 'Xem liền mạch, không bị làm phiền.',
  },
  fields: {
    email: 'Địa chỉ email',
    password: 'Mật khẩu',
    newPassword: 'Mật khẩu mới',
    show: 'Hiện',
    hide: 'Ẩn',
  },
  signIn: {
    title: 'Đăng nhập',
    subtitle: 'Tiếp tục xem từ chỗ bạn đã dừng.',
    submit: 'Đăng nhập',
    submitting: 'Đang đăng nhập...',
    noAccount: 'Mới dùng AnimeFork?',
    toSignUp: 'Đăng ký ngay',
  },
  signUp: {
    title: 'Tạo tài khoản',
    subtitle: 'Xem anime liền mạch, không quảng cáo.',
    passwordHint: 'Dùng ít nhất 8 ký tự.',
    submit: 'Tạo tài khoản',
    submitting: 'Đang tạo tài khoản...',
    hasAccount: 'Đã có tài khoản?',
    toSignIn: 'Đăng nhập',
    sent: {
      title: 'Kiểm tra email của bạn',
      lead: 'Chúng tôi đã gửi liên kết xác nhận tới',
      body: 'Mở email và chọn liên kết để hoàn tất tạo tài khoản. Không thấy? Hãy kiểm tra thư mục spam.',
      resent: 'Chúng tôi đã gửi liên kết mới.',
      didntGet: 'Không nhận được?',
      resend: 'Gửi lại email',
      resending: 'Đang gửi lại...',
      differentEmail: 'Dùng email khác',
      toSignIn: 'Về trang đăng nhập',
    },
  },
  verify: {
    verifying: 'Đang xác nhận email...',
    successTitle: 'Email đã được xác nhận',
    successBody: 'Tài khoản của bạn đã sẵn sàng. Hãy đăng nhập để bắt đầu xem.',
    toSignIn: 'Đăng nhập',
    failedTitle: 'Liên kết không dùng được',
    failedBody:
      'Liên kết xác nhận không đúng hoặc đã hết hạn. Hãy đăng ký lại để nhận liên kết mới.',
    toSignUp: 'Đăng ký lại',
    retryBody: 'Không thể xác nhận email lúc này. Hãy thử mở lại liên kết.',
  },
  errors: {
    invalidCredentials:
      'Email hoặc mật khẩu không đúng. Hãy kiểm tra lại và thử lại.',
    invalidEmail: 'Nhập một địa chỉ email hợp lệ.',
    passwordTooShort: 'Mật khẩu cần có ít nhất 8 ký tự.',
    passwordTooLong: 'Mật khẩu chỉ được tối đa 128 ký tự.',
    generic: 'Đã có lỗi xảy ra. Hãy thử lại sau ít phút.',
    rateLimited: (retryAfterSeconds?: number) =>
      retryAfterSeconds === undefined
        ? 'Bạn thử quá nhiều lần. Hãy chờ một lúc rồi thử lại.'
        : `Bạn thử quá nhiều lần. Hãy chờ khoảng ${Math.ceil(retryAfterSeconds / 60)} phút rồi thử lại.`,
  },
  header: {
    signIn: 'Đăng nhập',
    account: 'Tài khoản',
    menuLabel: 'Tài khoản',
    signedInAs: (email: string) => `Đăng nhập với ${email}`,
    signOut: 'Đăng xuất',
  },
} as const;
