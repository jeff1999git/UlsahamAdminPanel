interface RazorpayPaymentResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  image?: string
  order_id: string
  handler: (response: RazorpayPaymentResponse) => void
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  notes?: Record<string, string>
  theme?: { color?: string }
  modal?: {
    ondismiss?: () => void
    escape?: boolean
    backdropclose?: boolean
    animation?: boolean
  }
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void }
  }
}

export {}
