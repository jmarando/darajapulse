import type { TemplateEntry } from './registry.ts'
import { BookingEmail, previewBooking } from './storefront-booking-buyer.tsx'

// A storefront booking's emails to the media house: new booking, a transfer to confirm, paid, new files, the buyer's
// answer on the house-made ad. Same layout as the buyer's; the wording comes from houseCopy.

export const template = {
  component: BookingEmail,
  subject: (d: Record<string, any>) => d.copy?.subject || `Booking ${d.ref ?? ''}`.trim(),
  displayName: 'Storefront booking (to the media house)',
  previewData: {
    ...previewBooking,
    copy: {
      subject: 'Booking BK-7F3K2Q is paid: check the ad', heading: 'Paid', button: 'Open the booking',
      body: 'Wanjiku Foods paid KES 481,400. Check the ad and the times, then approve and schedule it.',
    },
    url: 'https://darajapulse.com/app/inventory?tab=requests&agency=radioafrica',
    bank: null,
  },
} satisfies TemplateEntry
