export const sampleRequest = {
  subProductId: 100007,
  productName: "Magazine",
  freeTest: 0,
  playground: 0,
  postCode: "20740",
  requestId: "0.3754428683489358",
  itemSpecification: {
    copies: 100,
    product: "BROCHURES",
    components: [
      {
        format: 4,
        standardSize: "IN_8_5_X_11",
        orientation: "PORTRAIT",
        colours: "PROCESS",
        substrate: { typeId: 1, weightId: 8, colourId: 0, design: "NONE" },
        componentType: "BOUND",
        folded: false,
        preDrilledHoles: "NONE",
        samplePackType: "PRODUCTS",
        pages: 24,
        lamination: "NONE",
        binding: { type: "STAPLED", sewn: false, edge: "LEFT_RIGHT" },
        ribbonColour: "NONE",
      },
      {
        format: 4,
        standardSize: "IN_8_5_X_11",
        orientation: "PORTRAIT",
        colours: "PROCESS",
        substrate: { typeId: 1, weightId: 2, colourId: 0, design: "NONE" },
        componentType: "COVER",
        folded: false,
        preDrilledHoles: "NONE",
        samplePackType: "PRODUCTS",
        foiling: {
          gold: false,
          silver: false,
          copper: false,
          red: false,
          blue: false,
          green: false,
        },
        lamination: "NONE",
        backColours: "PROCESS",
        backLamination: "NONE",
        backFoiling: {
          gold: false,
          silver: false,
          copper: false,
          red: false,
          blue: false,
          green: false,
        },
      },
    ],
    bound: true,
  },
  santaType: "QUOTE",
  designOption: "UPLOAD",
  approximateOffers: true,
  queryResponseTopicId: "715458",
};

export interface Quote {
  requestId: string;
  center: string;
  shopId: string;
  copies: number;
  total: number;
  fullPrice: number;
  publisherCommission: number;
  publishingHouseCommission: number;
  weight: number;
  weightKg: number;
  days: number;
  cutOffTime: number;
  link: string;
  ntotal: number;
  spine: number;
  productId: number;
  printType: string;
  printQuality: string;
  isExpress: boolean;
  currency: QuoteCurrency;
  pid: string;
  mid: string;
  offerTable: QuoteOfferTable[];
  approximatedOffers: any[];
  deliveryDate: number;
  vat: QuoteVat;
  forceVatable: boolean;
  freeTestMode: boolean;
  includeShipment: boolean;
  needDeliveryTask: boolean;
  hardProofAllowed: boolean;
  hardProofRequired: boolean;
  universalKey: string;
  packagingCost: number;
  usesQrCode: boolean;
  printOnDemandAvailable: boolean;
  designOptions: string[];
  financeAvailable: boolean;
  itemDescription: string;
}

interface QuoteCurrency {
  currencyId: number;
  name: string;
  prefix: string;
  currencyCode: string;
  currencyNumberCode: string;
  rate: number;
}

interface QuoteOfferTable {
  nprice: number;
  incidentals: number;
  price: number;
  fullPrice: number;
  publisherCommission: number;
  publishingHouseCommission: number;
  rank: number;
  days: number;
  copies: number;
  cutOffTime: number;
  daysSaved: number;
  costAdded: number;
  date: number;
  pid: string;
  name: string;
  mid: string;
  center: string;
  includeShipment: boolean;
  printType: string;
  printQuality: string;
  isExpress: boolean;
  isBestPrice: boolean;
  isBestTime: boolean;
  approximationGain: number;
  region: string;
  deliveryRates: QuoteDeliveryRate[];
  postcode: string;
  countryCode: string;
  machineDescription: string;
  countryOfOrigin: string;
  packagingCost: number;
  usesQrCode: boolean;
  splitDeliveryAvailable: boolean;
  priceType: string;
  afterpayAvailable: boolean;
  identifier: string;
  digital: boolean;
  isBestValue?: boolean;
}

interface QuoteDeliveryRate {
  type: number;
  total: number;
  carrierCode: string;
  carrier: string;
  serviceType: string;
  serviceDescription: string;
  days: number;
  duration: string;
  deliveryDate: number;
  rateCategory: number;
  providerClass: string;
}

interface QuoteVat {
  rate: number;
  included: boolean;
  fixed: boolean;
  vatCountryCodes: any[];
}
