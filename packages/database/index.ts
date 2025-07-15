export { 
  createOramaIndex, 
  insertSearchEntry, 
  insertMultipleSearchEntries, 
  searchOramaIndex,
  persistToFileStreamingMsgPackR,
  restoreFromFileStreamingMsgPackR,
  type OramaSearchDatabase,
  type CompressionType
} from './database.js';