# Homepage Design Testing

This package now includes three homepage design options for browse.show:

## Design Options

### Original Design
- **Command**: `pnpm dev`
- **URL**: http://localhost:5173
- **Description**: The current homepage design

### Design v2 - Cleaner Layout
- **Command**: `pnpm dev:v2`
- **URL**: http://localhost:5174
- **Description**: 
  - Cleaner, more focused layout
  - Header integrates theme toggle
  - Combined contact & CTA section with anchor ID
  - Simplified hero section
  - Uses PNG logo instead of SVG

### Design v3 - Card-Based Layout
- **Command**: `pnpm dev:v3`
- **URL**: http://localhost:5175
- **Description**:
  - Card-based layout with search emphasis
  - Three-column grid layout on desktop
  - Quick actions sidebar
  - Prominent contact grid
  - More detailed tagline in header

## Key Improvements in All New Designs

1. **Fixed scrolling issues** - Simplified scroll detection with passive listeners to fix Safari/iMessage problems
2. **PNG logo usage** - Replaced SVG favicon with PNG version for better consistency
3. **Enhanced contact information** - All designs include:
   - Email: contact@browse.show
   - GitHub repo: browse-dot-show
   - Creator GitHub: @jackkoppa
   - Bluesky: jackpa.dev
4. **Improved headers** - Better match client site design patterns
5. **Better theme toggle placement** - Integrated into header actions
6. **Contact anchor** - Easy linking from individual sites with `#contact` anchor
7. **Less text** - Streamlined copy for better user experience
8. **Prominent CTAs** - Request podcast and self-host buttons are more visible

## Testing Commands

```bash
# Test original design
pnpm dev

# Test v2 design
pnpm dev:v2

# Test v3 design  
pnpm dev:v3

# Build all versions
pnpm build
pnpm build:v2
pnpm build:v3
```

## Notes

- Each design runs on a different port to allow comparison
- All designs share the same core functionality
- Contact information uses placeholder values as requested
- Scroll handling is simplified to fix Safari/iMessage issues
- Theme toggle is better integrated in new designs