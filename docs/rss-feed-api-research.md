# Podcast RSS Feed Discovery API Research

This document contains research on APIs that can be used to automatically discover podcast RSS feeds based on podcast name and homepage URL.

## 🎯 Primary Recommendation: Listen Notes API

**Website**: https://www.listennotes.com/api/  
**Pricing**: Free tier available, paid plans for higher usage  
**Coverage**: 3.6M+ podcasts, 179M+ episodes  

### Pros:
- Comprehensive podcast database
- Reliable search by podcast name
- Returns RSS feed URLs directly
- Good API documentation
- Free tier suitable for development
- Used by many production applications

### API Example:
```javascript
// Search for podcast by name
const response = await fetch(
  `https://listen-api.listennotes.com/api/v2/search?q=${encodeURIComponent(podcastName)}&type=podcast&only_in=title&safe_mode=0`,
  {
    headers: {
      'X-ListenAPI-Key': 'YOUR_API_KEY'
    }
  }
);

const data = await response.json();
// Returns array of podcasts with RSS feed URLs
```

### Integration Plan:
1. Add Listen Notes API key to environment variables
2. Implement search function in `scripts/create-site.ts`
3. Present multiple results to user for selection
4. Fall back to manual input if no results found

## 🔄 Alternative APIs

### 1. Podcast Index API
**Website**: https://api.podcastindex.org/  
**Pricing**: Free, donation-supported  
**Coverage**: 4M+ podcasts  

**Pros**: Free, open-source community  
**Cons**: Smaller database, less reliable uptime  

### 2. iTunes Search API
**Website**: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/  
**Pricing**: Free  
**Coverage**: Apple Podcasts catalog  

**Pros**: Free, no API key required  
**Cons**: Doesn't directly provide RSS URLs, requires additional lookup  

### 3. AllFeeds.ai
**Website**: https://allfeeds.ai/  
**Pricing**: Paid service  
**Coverage**: Comprehensive  

**Pros**: Very comprehensive data  
**Cons**: More expensive, overkill for simple RSS discovery  

## 🛠️ Implementation Strategy

### Phase 1: Manual Input (Current)
- User enters RSS feed URL manually
- Works for all podcasts
- No API dependency

### Phase 2: Listen Notes Integration (Recommended Next)
- Search by podcast name
- Present multiple options to user
- Fall back to manual input

### Phase 3: Multi-API Fallback (Future Enhancement)
- Try Listen Notes first
- Fall back to Podcast Index
- Fall back to iTunes + RSS discovery
- Finally fall back to manual input

## 📝 Implementation Notes

### Environment Variables Needed:
```bash
# .env or .env.local
LISTEN_NOTES_API_KEY=your_api_key_here
```

### Error Handling:
- Network timeouts (set 10-second timeout)
- API rate limiting (respect 429 responses)
- Invalid API responses (validate structure)
- No results found (graceful fallback)

### User Experience:
- Show "Searching..." progress indicator
- Present results in user-friendly format
- Allow user to confirm correct podcast
- Provide option to enter URL manually

### Code Integration Points:
- Update `searchPodcastRSSFeed()` function
- Add API key validation at startup
- Implement result selection UI
- Add error handling and retries

## 🔧 Testing Strategy

### Unit Tests:
- Mock API responses
- Test error conditions
- Verify RSS URL extraction

### Integration Tests:
- Test with real API calls
- Verify popular podcasts are found
- Test edge cases (multiple results, no results)

### User Testing:
- Test with various podcast names
- Verify search accuracy
- Confirm fallback mechanisms work

## 📊 Success Metrics

### Accuracy:
- >90% of popular podcasts found on first search
- <5% false positives (wrong podcast selected)

### Performance:
- <3 seconds average search time
- <1% API failure rate
- Graceful degradation when API unavailable

### User Experience:
- <3 user interactions to complete setup
- Clear error messages and guidance
- Obvious path to manual input when needed

---

**Next Steps**: Implement Listen Notes API integration in the site creation script for automatic RSS feed discovery.