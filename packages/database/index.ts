export { 
  createOramaIndex, 
  insertSearchEntry, 
  insertMultipleSearchEntries, 
  searchOramaIndex, 
  serializeOramaIndex, 
  deserializeOramaIndex,
  persistToFileStreaming,
  restoreFromFileStreaming,
  type OramaSearchDatabase,
  type CompressionType
} from './database.js';