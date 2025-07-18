# Custom Icons & Branding Guide

This guide will help you create custom icons and branding assets for your podcast site to replace the default browse.show branding.

## 🎨 What You'll Create

Your site needs these custom assets:
- **Favicon** (16x16, 32x32, 48x48 pixels)
- **App Icons** (192x192, 512x512 pixels for PWA)
- **Social Card** (1200x630 pixels for Open Graph)
- **Logo** (SVG format for scalability)

## 📁 Asset Structure

All custom assets should be placed in your site's assets directory:
```
sites/my-sites/[your-site]/assets/
├── favicon.ico
├── icon-192.png
├── icon-512.png
├── logo.svg
└── social-cards/
    └── open-graph-card-1200x630.jpg
```

## 🛠️ Design Guidelines

### Color Scheme
Use your podcast's brand colors, but ensure good contrast:
- **Text on light backgrounds**: Use colors with contrast ratio ≥ 4.5:1
- **Text on dark backgrounds**: Use colors with contrast ratio ≥ 4.5:1
- **Interactive elements**: Should be easily distinguishable

### Logo Design
- **Minimum size**: Should be readable at 32x32 pixels
- **Format**: Create as SVG for scalability
- **Simplicity**: Avoid complex details that don't scale well
- **Brand consistency**: Match your podcast's existing branding

### Icon Requirements
- **Favicon**: Simple, recognizable symbol from your brand
- **App Icons**: Work well on mobile device home screens
- **Social Cards**: Include podcast name and engaging imagery

## 🎯 Recommended Tools

### Free Tools
- **Canva**: Templates for social cards and logos
- **GIMP**: Free image editing for complex designs
- **Inkscape**: Free vector graphics for SVG logos
- **Figma**: Free design tool with great icon templates

### Paid Tools
- **Adobe Creative Suite**: Professional design tools
- **Sketch**: Mac-only design application
- **Affinity Designer**: One-time purchase alternative to Adobe

### AI-Powered Tools
- **Midjourney**: Generate unique artwork and logos
- **DALL-E**: Create custom imagery for social cards
- **Looka**: AI logo generator specifically for brands
- **Brandmark**: AI-powered logo and brand asset creation

## 📐 Specific Asset Instructions

### 1. Favicon (favicon.ico)
```bash
# Recommended sizes to include in .ico file:
16x16, 32x32, 48x48 pixels
```
- Use your podcast's main symbol or initial
- High contrast for visibility in browser tabs
- Test on both light and dark browser themes

### 2. App Icons
**icon-192.png** and **icon-512.png**
- Use your full logo or a simplified version
- Add padding so the icon doesn't touch edges
- Test how it looks on various device backgrounds

### 3. Social Card (1200x630px)
Key elements to include:
- **Podcast name** (large, readable text)
- **Your logo or brand imagery**
- **browse.show attribution** (small, in corner)
- **Consistent color scheme**

### 4. Logo (logo.svg)
- Create as vector graphics for infinite scalability
- Include both horizontal and stacked versions if needed
- Keep file size under 50KB for fast loading

## 🔧 Implementation Steps

### Step 1: Create Your Assets
1. Design your assets using the tools above
2. Export in the correct formats and sizes
3. Optimize images for web (compress without losing quality)

### Step 2: Add to Your Site
1. Place assets in `sites/my-sites/[your-site]/assets/`
2. Update your `site.config.json` to reference new assets:
```json
{
  "socialAndMetadata": {
    "openGraphImagePath": "./assets/social-cards/open-graph-card-1200x630.jpg"
  }
}
```

### Step 3: Test Your Assets
```bash
# Validate your site configuration
pnpm validate:sites

# Start local development to preview
pnpm client:dev
```

### Step 4: Deploy Updates
```bash
# Deploy your updated site
pnpm site:deploy
```

## ✅ Quality Checklist

Before finalizing your assets:

**Favicon**
- [ ] Visible at 16x16 pixels
- [ ] Recognizable when small
- [ ] Works on light and dark backgrounds

**App Icons**
- [ ] Clear and readable at mobile sizes
- [ ] Proper padding from edges
- [ ] Consistent with brand colors

**Social Card**
- [ ] Text is readable when shared
- [ ] Represents your podcast well
- [ ] Includes browse.show attribution
- [ ] File size under 1MB

**Logo**
- [ ] Scales well from large to small
- [ ] Consistent with other assets
- [ ] Loads quickly (SVG under 50KB)

## 🎨 Inspiration Resources

### Design Inspiration
- **Dribbble**: Search "podcast logo" or "app icon"
- **Behance**: Browse branding projects
- **LogoLounge**: Professional logo showcase
- **Brand New**: Brand identity case studies

### Podcast Branding Examples
Look at successful podcast brands for inspiration:
- **Serial**: Clean, minimal typography
- **The Daily**: Bold, newspaper-inspired design
- **Radiolab**: Playful, scientific aesthetic
- **99% Invisible**: Architectural, precise design

## 🆘 Need Help?

### Asset Issues
- **Images not showing**: Check file paths in `site.config.json`
- **Poor quality**: Ensure you're using the right dimensions
- **Slow loading**: Compress images without losing quality

### Design Resources
- **Free icons**: Feather Icons, Heroicons, Phosphor Icons
- **Free fonts**: Google Fonts has great podcast-friendly typefaces
- **Color palettes**: Coolors.co for generating harmonious colors

### Professional Help
Consider hiring a designer for:
- Complete brand identity packages
- Custom illustrations or artwork
- Professional social media templates

---

**Next Step**: Once your assets are ready, you might want to [customize your color scheme](./custom-theme-guide.md) to match your new branding!