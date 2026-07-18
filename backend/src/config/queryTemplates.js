const CATEGORY_QUERY_PHRASES = {
  'Corporate Services': 'company incorporation corporate secretarial annual return company registry director nominee filing compliance',
  'Accounting & Tax': 'corporate income tax GST VAT tax filing transfer pricing e-invoicing accounting compliance',
  'Compliance & Governance': 'regulatory compliance corporate governance AML KYC sanctions due diligence risk management',
  'HR & Employment': 'employment law payroll work pass immigration employer of record labour compliance',
  'Fund Administration': 'fund administration VCC fund accounting fund governance asset management regulatory filing',
  'Financial Advisory': 'M&A transaction advisory corporate finance valuation business consulting market analysis',
  'Fiduciary & Trust Services': 'trust fiduciary trustee family office private client wealth structuring compliance',
  'Cross Border & FDI': 'foreign direct investment market entry cross border expansion company setup investment rules',
  'Economy & Trade': 'economic policy trade policy business regulation budget tax authority company registry',
  'Competitor Intelligence': 'service launch expansion acquisition partnership new office client advisory competitor'
};

const GOVT_CATEGORY_QUERY_PHRASES = {
  'Corporate Services': 'company registry corporate regulatory compliance company secretary business registration',
  'Accounting & Tax': 'tax authority corporate tax GST VAT tax compliance accounting filing',
  'Compliance & Governance': 'regulatory compliance corporate governance AML KYC risk disclosure',
  'HR & Employment': 'employment law payroll work pass immigration labour compliance',
  'Fund Administration': 'fund regulation asset management VCC fund governance regulatory filing',
  'Financial Advisory': 'corporate finance M&A advisory market conduct regulatory compliance',
  'Fiduciary & Trust Services': 'trust fiduciary family office private wealth regulatory compliance',
  'Cross Border & FDI': 'foreign investment market entry cross border business setup investment rules',
  'Economy & Trade': 'economic policy trade policy budget business regulation tax authority company registry',
  'Competitor Intelligence': 'professional services market activity regulatory approval expansion'
};

const COUNTRY_CATEGORY_QUERY_PHRASES = {
  Singapore: {
    'Corporate Services': 'ACRA company incorporation corporate secretarial annual return compliance',
    'Accounting & Tax': 'IRAS corporate tax GST transfer pricing tax filing',
    'Compliance & Governance': 'MAS ACRA AML KYC corporate governance compliance',
    'HR & Employment': 'MOM employment pass work permit payroll labour compliance',
    'Fund Administration': 'MAS fund regulation VCC private equity asset management',
    'Financial Advisory': 'MAS SGX M&A restructuring insolvency ESG',
    'Fiduciary & Trust Services': 'MAS family office trust wealth management',
    'Cross Border & FDI': 'EDB MTI FDI foreign investment market entry',
    'Economy & Trade': 'MTI MAS EDB budget trade policy business incentives'
  },
  'Hong Kong': {
    'Corporate Services': 'Companies Registry company incorporation corporate secretarial annual return compliance',
    'Accounting & Tax': 'IRD profits tax transfer pricing tax filing',
    'Compliance & Governance': 'HKMA SFC AML KYC corporate governance compliance',
    'HR & Employment': 'Labour Department immigration employment visa work permit payroll',
    'Fund Administration': 'SFC HKMA fund regulation asset management private fund',
    'Financial Advisory': 'SFC HKEX M&A restructuring insolvency ESG',
    'Fiduciary & Trust Services': 'SFC HKMA family office trust wealth management',
    'Cross Border & FDI': 'InvestHK FDI foreign investment market entry',
    'Economy & Trade': 'HKMA SFC budget trade policy business incentives'
  },
  China: {
    'Corporate Services': 'SAMR company registration business law',
    'Accounting & Tax': 'SAT corporate tax transfer pricing',
    'Fund Administration': 'CSRC fund regulation venture capital',
    'HR & Employment': 'MOHRSS labour law work visa',
    'Fiduciary & Trust Services': 'family office trust regulation',
    'Compliance & Governance': 'PBOC AML compliance',
    'Financial Advisory': 'MOFCOM M&A insolvency regulation',
    'Cross Border & FDI': 'MOFCOM FDI cross-border investment',
    'Economy & Trade': 'MOFCOM PBOC CSRC economic regulatory updates'
  }
};

const GOVT_QUERY_BUCKETS_BY_COUNTRY = {
  Singapore: [
    'Singapore MAS ACRA IRAS MOM EDB new regulation policy circular announcement {year}',
    'Singapore government budget tax incentive grant GST new announcement {year}',
    'Singapore MOM work pass employment pass immigration labour rule change {year}'
  ],
  'Hong Kong': [
    'Hong Kong HKMA SFC Companies Registry IRD new regulation policy announcement {year}',
    'Hong Kong government budget profits tax incentive new announcement {year}',
    'Hong Kong Labour Department immigration work visa employment rule change {year}'
  ],
  China: [
    'China SAMR CSRC PBOC MOFCOM SAT new business regulation policy law {year}',
    'China government policy reform foreign investment business regulation update {year}',
    'China labour law employment rule social security change policy {year}'
  ]
};

const DEFAULT_GOVT_QUERY_BUCKETS = [
  '{country} {authorities} new regulation policy circular announcement {year}',
  '{country} government budget tax incentive grant new announcement {year}',
  '{country} labour immigration employment rule change policy {year}'
];

const COMPETITOR_QUERY_TEMPLATES = [
  '{competitors} {country} expansion acquisition new office service launch {year}',
  '{competitors} {country} partnership leadership appointment hiring market entry {year}',
  '{competitors} {country} corporate services fund administration tax compliance growth {year}'
];

const GOVT_QUERY_TEMPLATES = [
  '{country} {authorities} {intent} official announcement regulation circular consultation update {year}',
  '{country} {intent} government update filing requirement rule change deadline {year}'
];

const COUNTRY_AUTHORITY_HINTS = {
  'Abu Dhabi (UAE)': 'ADGM FSRA Abu Dhabi UAE',
  Australia: 'ASIC APRA ATO Australia',
  'British Virgin Islands': 'BVI FSC British Virgin Islands',
  'Cayman Islands': 'CIMA Cayman Islands',
  China: 'China MOFCOM SAMR PBOC CSRC',
  Cyprus: 'CySEC Cyprus Registrar of Companies Tax Department',
  'Dubai (UAE)': 'DIFC DFSA DMCC Dubai UAE FTA',
  'Hong Kong': 'Hong Kong Companies Registry SFC HKMA IRD Labour Department',
  India: 'India MCA CBDT CBIC SEBI RBI DPIIT',
  Indonesia: 'Indonesia OJK BKPM OSS DGT Ministry Manpower',
  Malaysia: 'Malaysia SSM LHDN SC BNM',
  'Miami (United States)': 'Miami Florida SEC FINRA IRS USCIS',
  'Montevideo (Uruguay)': 'Uruguay BCU DGI MTSS',
  Philippines: 'Philippines SEC BIR DOLE BSP PEZA',
  'Saint Kitts & Nevis': 'Saint Kitts Nevis FSC',
  'Sao Paulo (Brazil)': 'Brazil CVM BACEN Receita Federal Sao Paulo',
  Singapore: 'Singapore ACRA IRAS MOM MAS',
  'United Kingdom': 'UK Companies House HMRC FCA PRA',
  Vietnam: 'Vietnam MPI DICA GDT MOLISA SSC SBV'
};

const TOPIC_QUERY_TEMPLATES = {
  news: '{country} {intent} latest update news regulation business {year}',
  govt: '{country} {authorities} latest official announcement circular consultation regulation update on {intent} {year}',
  competitor: '{competitors} {country} {intent} expansion acquisition partnership service launch hiring {year}',
  evergreen: '{country} {intent} guide requirements process compliance filing {year}',
  default: 'latest {country} {intent} update announcement regulation {year}'
};

module.exports = {
  CATEGORY_QUERY_PHRASES,
  GOVT_CATEGORY_QUERY_PHRASES,
  COUNTRY_CATEGORY_QUERY_PHRASES,
  GOVT_QUERY_BUCKETS_BY_COUNTRY,
  DEFAULT_GOVT_QUERY_BUCKETS,
  COMPETITOR_QUERY_TEMPLATES,
  GOVT_QUERY_TEMPLATES,
  COUNTRY_AUTHORITY_HINTS,
  TOPIC_QUERY_TEMPLATES
};
