/**
 * Known foreign broker codes on IDX.
 * These are the major international brokerages operating in Indonesia.
 * Any code not in this set is classified as domestic.
 */
export const FOREIGN_BROKER_CODES = new Set([
  // US / Global
  "MS", // Morgan Stanley
  "GS", // Goldman Sachs
  "JP", // JP Morgan
  "ML", // Merrill Lynch
  "CG", // Citigroup
  "BK", // BNP Paribas (via BNI Securities in some mappings)

  // European
  "CS", // Credit Suisse
  "UB", // UBS
  "DB", // Deutsche Bank
  "RX", // Macquarie
  "AZ", // ABN AMRO / RBS
  "CC", // CLSA

  // Asian
  "DX", // Daiwa
  "NI", // Nomura
  "KZ", // Samsung Securities
  "MU", // Mitsubishi UFJ
  "YJ", // Yuanta
  "FS", // Maybank Kim Eng

  // Regional
  "LG", // HSBC
  "OD", // Standard Chartered
  "SQ", // Société Générale
  "KK", // KGI Securities
  "PG", // Phillip Securities
]);

export function classifyBroker(code: string): "foreign" | "domestic" {
  return FOREIGN_BROKER_CODES.has(code.toUpperCase()) ? "foreign" : "domestic";
}
