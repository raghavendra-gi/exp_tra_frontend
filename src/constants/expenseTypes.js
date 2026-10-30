export const TRANSPORT_BY_TICKET  = ['Bus', 'Train', 'Flight'];
export const TRANSPORT_BY_VEHICLE = ['Car', 'Bike'];
export const EXPENSE_TYPES = {
'Pooja': {
    icon: '🙏', title: 'Pooja Expenses',
    fields: [
      { key: 'items', type: 'checkboxes', label: 'Items / Approvals', required: true, allowOther: true,
        options: ['Flowers','Agarabathi','Camphor','Haldi','Kunkuma','Cotton Wicks','Sesame oil','Cow Ghee','Chandan Powder'] },
      { key: 'date',    type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'amount',  type: 'number', label: 'Amount', money: true, required: true, min: 0.01 },
      { key: 'receipt', type: 'file',   label: 'Bill / Receipt', title: 'Upload bill or receipt', hint: 'PNG, JPG or PDF up to 5 MB' },
      { key: 'remarks', type: 'textarea', label: 'Comments', placeholder: 'Write comments here' },
    ]
  },
  'Food': {
    icon: '🍽️', title: 'Food Expenses',
    fields: [
      { key: 'items', type: 'checkboxes', label: 'Items / Approvals', required: true, allowOther: true,
        options: ['Tiffin','Lunch','Dinner'] },
      { key: 'date',    type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'amount',  type: 'number', label: 'Amount', money: true, required: true, min: 0.01 },
      { key: 'receipt', type: 'file',   label: 'Bill / Receipt', title: 'Upload bill or receipt', hint: 'PNG, JPG or PDF up to 5 MB' },
      { key: 'remarks', type: 'textarea', label: 'Comments', placeholder: 'Write comments here' },
    ]
  },
  'Plan Trip': {
    icon: '✈️', title: 'Plan Trip Expenses',
    fields: [
      { key: 'date',       type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'from',       type: 'place',  label: 'Starting location', placeholder: 'Search a place, address or city', required: true, geolocate: true },
      { key: 'to',         type: 'place',  label: 'Destination',       placeholder: 'Search a place, address or city', required: true },
      { key: 'routeInfo',  type: 'route',  label: 'Route', fromKey: 'from', toKey: 'to', kmKey: 'kilometers' },
      { key: 'kilometers', type: 'number', label: 'Kilometers', placeholder: 'Filled automatically from the route', required: true, min: 0, autoKm: true },
      { key: 'transport',  type: 'chips',  label: 'Type of transport', required: true,
        options: [...TRANSPORT_BY_TICKET, ...TRANSPORT_BY_VEHICLE] },
      { key: 'ticketBill', type: 'file', label: 'Ticket bill', title: 'Upload ticket bill', hint: 'PNG, JPG or PDF up to 5 MB',
        showIf: v => TRANSPORT_BY_TICKET.includes(v.transport) },
      { key: 'startMeter', type: 'file', label: 'Start meter', title: 'Upload start meter image', hint: 'Photo of the odometer before you left',
        showIf: v => TRANSPORT_BY_VEHICLE.includes(v.transport) },
      { key: 'endMeter',   type: 'file', label: 'End meter', title: 'Upload end meter image', hint: 'Photo of the odometer on arrival',
        showIf: v => TRANSPORT_BY_VEHICLE.includes(v.transport) },
      { key: 'amount',     type: 'number', label: 'Amount', money: true, required: true, min: 0.01 },
      { key: 'remarks',    type: 'textarea', label: 'Remarks', placeholder: 'Enter remarks here' },
    ]
  },
  'Regional Trip': {
    icon: '🚗', title: 'Regional Trip',
    twoStage: true, startTitle: 'Start Regional Trip', endTitle: 'Regional Trip Summary',
    fields: [
      { key: 'date',            type: 'date',   label: 'Date', required: true, default: 'today', stage: 'start' },
      { key: 'startLocation',   type: 'place',  label: 'Start location', placeholder: 'Where are you starting?', required: true, stage: 'start', geolocate: true },
      { key: 'startMeterImage', type: 'file',   label: 'Start meter image', title: 'Upload start meter image',
        hint: "Photo of your vehicle's odometer at the start", required: true, stage: 'start' },
      { key: 'endLocation',     type: 'place',  label: 'End location', placeholder: 'Where did you arrive?', required: true, stage: 'end' },
      { key: 'routeInfo',       type: 'route',  label: 'Route', fromKey: 'startLocation', toKey: 'endLocation', kmKey: 'distanceKm', stage: 'end' },
      { key: 'distanceKm',      type: 'number', label: 'Total distance (km)', placeholder: 'Filled automatically from the route',
        required: true, min: 0.1, unit: 'km', autoKm: true, stage: 'end' },
      { key: 'endMeterImage',   type: 'file',   label: 'End meter image', title: 'Upload end meter image',
        hint: 'Photo of the odometer at the end', required: true, stage: 'end' },
      { key: 'remarks',         type: 'textarea', label: 'Remarks', placeholder: 'Enter remarks here', stage: 'end' },
    ]
  },
  'Accommodation': {
    icon: '🏨', title: 'Accommodation Expenses', dateField: 'fromDate',
    fields: [
      { key: 'items',    type: 'checkboxes', label: 'Items / Approvals', required: true, options: ['Hotel','Food'] },
      { key: 'fromDate', type: 'date', label: 'From date', required: true, default: 'today' },
      { key: 'toDate',   type: 'date', label: 'To date', required: true, minFrom: 'fromDate' },
      { key: 'amount',   type: 'number', label: 'Amount', money: true, required: true, min: 0.01 },
      { key: 'receipt',  type: 'file', label: 'Bills / Receipts', title: 'Upload bills or receipts', hint: 'You can add several files', multiple: true },
      { key: 'remarks',  type: 'textarea', label: 'Remarks', placeholder: 'Enter remarks' },
    ]
  },
  'Inauguration': {
    icon: '🎉', title: 'Inauguration Expenses',
    fields: [
      { key: 'eventName',     type: 'text',   label: 'Event name', placeholder: 'Enter event name', required: true },
      { key: 'date',          type: 'date',   label: 'Date of inauguration', required: true, default: 'today' },
      { key: 'location',      type: 'text',   label: 'Location', placeholder: 'Enter location', required: true },
      { key: 'estimatedCost', type: 'number', label: 'Estimated cost', money: true, placeholder: 'Estimated cost', min: 0 },
      { key: 'amount',        type: 'number', label: 'Actual cost', money: true, placeholder: 'Actual cost', required: true, min: 0.01 },
      { key: 'receipt',       type: 'file',   label: 'Bills / Receipts', title: 'Upload bills or receipts', hint: 'You can add several files', multiple: true },
      { key: 'remarks',       type: 'textarea', label: 'Additional remarks', placeholder: 'Enter additional remarks' },
    ]
  },
  'Couriers': {
    icon: '📦', title: 'Courier Expenses',
    fields: [
      { key: 'courierService', type: 'select', label: 'Courier service', required: true, placeholder: 'Select courier service',
        options: ['DTDC','Blue Dart','FedEx','India Post','Professional Couriers','Delhivery','Other'] },
      { key: 'recipientName',  type: 'text',   label: 'Recipient name', placeholder: 'Recipient name', required: true },
      { key: 'trackingNumber', type: 'text',   label: 'Tracking number', placeholder: 'Tracking number' },
      { key: 'amount',         type: 'number', label: 'Cost', money: true, required: true, min: 0.01 },
      { key: 'date',           type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'receipt',        type: 'file',   label: 'Bill / Receipt', title: 'Upload bill or receipt', hint: 'PNG, JPG or PDF up to 5 MB' },
    ]
  },
  'Gifts': {
    icon: '🎁', title: 'Gift Expenses',
    fields: [
      { key: 'recipientName',   type: 'text',   label: "Recipient's name", placeholder: "Enter recipient's name", required: true },
      { key: 'occasion',        type: 'select', label: 'Occasion', required: true, placeholder: 'Select occasion',
        options: ['Birthday','Wedding','Festival','Farewell','Anniversary','Client Gift','Other'] },
      { key: 'giftDescription', type: 'text',   label: 'Gift item description', placeholder: 'Describe the gift', required: true },
      { key: 'amount',          type: 'number', label: 'Cost', money: true, required: true, min: 0.01 },
      { key: 'date',            type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'receipt',         type: 'file',   label: 'Bill / Receipt', title: 'Upload bill or receipt', hint: 'PNG, JPG or PDF up to 5 MB' },
      { key: 'remarks',         type: 'textarea', label: 'Remarks', placeholder: 'Enter remarks here' },
    ]
  },
  'Miscellaneous': {
    icon: '📋', title: 'Miscellaneous Expenses',
    fields: [
      { key: 'description', type: 'text',   label: 'Description', placeholder: 'Enter expense description', required: true },
      { key: 'amount',      type: 'number', label: 'Amount', money: true, required: true, min: 0.01 },
      { key: 'date',        type: 'date',   label: 'Date', required: true, default: 'today' },
      { key: 'receipt',     type: 'file',   label: 'Bill / Receipt', title: 'Upload bill or receipt', hint: 'PNG, JPG or PDF up to 5 MB' },
      { key: 'remarks',     type: 'textarea', label: 'Remarks', placeholder: 'Enter remarks here' },
    ]
  },
};
