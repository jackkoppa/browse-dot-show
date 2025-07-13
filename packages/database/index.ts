export { 
  createOramaIndex, 
  insertSearchEntry, 
  insertMultipleSearchEntries, 
  searchOramaIndex,
  persistToFileStreaming,
  restoreFromFileStreamingOptimized,
  persistToFileStreamingMsgPackR,
  restoreFromFileStreamingMsgPackR,
  type OramaSearchDatabase,
  type CompressionType
} from './database.js';