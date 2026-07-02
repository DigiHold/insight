-- Insight: ClickHouse schema. Created automatically on the container's first start.
-- The "insight" database is already created via the CLICKHOUSE_DB variable.

CREATE TABLE IF NOT EXISTS insight.events (
  ts            DateTime64(3) DEFAULT now64(),
  site_id       LowCardinality(String),
  visitor_id    String,
  session_id    String,
  event_type    LowCardinality(String),   -- pageview | click | custom | conversion
  url           String,
  pathname      String,
  query         String,
  referrer      String,
  source        LowCardinality(String),   -- google | x | linkedin | facebook | reddit | chatgpt | direct ...
  source_type   LowCardinality(String),   -- search | social | ai | referral | direct
  utm_source    String,
  utm_medium    String,
  utm_campaign  String,
  utm_term      String,
  utm_content   String,
  landing_page  String,
  click_target  String,
  country       LowCardinality(String),
  region        String,
  city          String,
  device        LowCardinality(String),
  browser       LowCardinality(String),
  os            LowCardinality(String),
  language      LowCardinality(String),
  screen_w      UInt16,
  duration_ms   UInt32
) ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (site_id, ts);

CREATE TABLE IF NOT EXISTS insight.ai_hits (
  ts          DateTime64(3) DEFAULT now64(),
  site_id     LowCardinality(String),
  path        String,
  bot_name    LowCardinality(String),
  vendor      LowCardinality(String),   -- openai | anthropic | perplexity | google | xai ...
  category    LowCardinality(String),   -- answer | search | training
  ua_string   String,
  ip          String,
  verified    UInt8,
  status_code UInt16
) ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (site_id, ts);

CREATE TABLE IF NOT EXISTS insight.ga4_daily (
  site_id   LowCardinality(String),
  date      Date,
  dim       LowCardinality(String),   -- total | source | country | device | browser | os | page
  value     String,
  visitors  UInt32,
  pageviews UInt32
) ENGINE = MergeTree
ORDER BY (site_id, dim, date);

CREATE TABLE IF NOT EXISTS insight.revenue (
  ts          DateTime64(3) DEFAULT now64(),
  site_id     LowCardinality(String),
  visitor_id  String,
  amount      Decimal(12,2),
  currency    LowCardinality(String),
  provider    LowCardinality(String),
  source      LowCardinality(String),
  campaign    String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (site_id, ts);
