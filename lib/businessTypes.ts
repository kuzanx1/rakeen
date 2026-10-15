// Every business_type a new account can start as. One list for the
// self-serve signup and the admin's "add subscriber" form.
export const BUSINESS_TYPES = [
  "restaurant", "quick_service", "cafe", "cloud_kitchen",
  "salon", "ladies_salon", "car_wash", "mobile_car_wash",
  "clinic", "tailoring", "hotel", "retail", "other",
] as const;

// quick_service/cafe/cloud_kitchen are business_type='restaurant' under the
// hood; the only difference is a POS without a dining room.
export const NO_DINING_ROOM_TYPES = ["quick_service", "cafe", "cloud_kitchen"];
