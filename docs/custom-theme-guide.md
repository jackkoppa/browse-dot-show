# Custom Theme & Color Scheme Guide

This guide will help you customize your podcast site's colors and styling using the shadcn/ui theme system that powers browse.show.

## 🎨 Theme System Overview

Your site uses a powerful theming system based on:
- **shadcn/ui**: Modern component design system
- **CSS Custom Properties**: For dynamic color switching
- **Tailwind CSS**: Utility-first styling framework
- **Dark/Light Mode**: Automatic theme switching

## 🌈 Getting Started with Themes

### Step 1: Visit the Theme Generator

1. Go to [shadcn/ui Theme Generator](https://ui.shadcn.com/themes)
2. Choose "New York" style (matches browse.show design)
3. Select your border radius preference (browse.show uses 0px for sharp edges)

### Step 2: Pick Your Colors

**Base Colors** (required):
- **Background**: Main page background color
- **Foreground**: Primary text color
- **Primary**: Brand color (buttons, links, accents)
- **Secondary**: Supporting color for highlights

**Extended Colors** (optional but recommended):
- **Muted**: Subtle backgrounds and disabled text
- **Accent**: Call-to-action elements
- **Destructive**: Error states and warnings
- **Border**: Lines, dividers, and component outlines

### Step 3: Generate Your Theme

1. Use the color picker to customize each color
2. Preview in both light and dark modes
3. Copy the generated CSS custom properties

## 🔧 Implementation Steps

### Step 1: Update Your Theme File

Your site already has a theme file at:
```
sites/my-sites/[your-site]/browse-dot-show-theme.css
```

Replace the color variables section with your generated theme:

```css
:root {
  /* Your custom colors from shadcn/ui theme generator */
  --background: #ffffff;
  --foreground: #0c0a09;
  --primary: #your-primary-color;
  --primary-foreground: #ffffff;
  --secondary: #your-secondary-color;
  --secondary-foreground: #0c0a09;
  /* ... rest of your custom colors */
}

.dark {
  /* Dark mode variants */
  --background: #0c0a09;
  --foreground: #fafaf9;
  --primary: #your-primary-color-dark;
  /* ... rest of your dark mode colors */
}
```

### Step 2: Update Site Configuration

Update your `site.config.json` to match your theme:

```json
{
  "themeColor": "#your-primary-color",
  "themeColorDark": "#your-primary-color-dark"
}
```

### Step 3: Test Your Theme

```bash
# Validate configuration
pnpm validate:sites

# Start development server to preview
pnpm client:dev
```

## 🎯 Podcast-Specific Color Ideas

### Genre-Based Palettes

**True Crime**
- Dark, moody colors (deep purples, grays, burgundy)
- High contrast for readability
- Example: `--primary: #8b5cf6` (purple)

**Comedy**
- Bright, energetic colors (yellows, oranges, pinks)
- Playful and approachable
- Example: `--primary: #f59e0b` (amber)

**Technology**
- Modern, tech-inspired (blues, teals, green accents)
- Clean and professional
- Example: `--primary: #0ea5e9` (sky blue)

**Business/Finance**
- Professional, trustworthy (navy, green, gray)
- Sophisticated and credible
- Example: `--primary: #059669` (emerald)

**Health/Wellness**
- Calming, natural colors (greens, blues, earth tones)
- Peaceful and trustworthy
- Example: `--primary: #10b981` (emerald)

**Sports**
- Bold, energetic colors (reds, oranges, team colors)
- Dynamic and exciting
- Example: `--primary: #dc2626` (red)

## 🎨 Advanced Customization

### Custom CSS Classes

Add custom styles to your theme file:

```css
/* Custom podcast-specific styles */
.podcast-episode-card {
  border-left: 4px solid var(--primary);
  background: var(--muted);
}

.search-highlight {
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}

/* Custom animations */
.episode-hover {
  transition: all 0.2s ease-in-out;
}

.episode-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Typography Customization

Customize fonts in your theme file:

```css
:root {
  /* Font families */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Merriweather', serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Font sizes for podcast content */
  --font-size-episode-title: 1.25rem;
  --font-size-episode-description: 0.875rem;
  --font-size-transcript: 0.9rem;
}
```

### Responsive Design

Ensure your colors work across devices:

```css
/* Mobile-specific adjustments */
@media (max-width: 768px) {
  :root {
    /* Increase contrast for mobile */
    --muted: #f8f9fa;
    --border: #e9ecef;
  }
}
```

## ✅ Theme Testing Checklist

**Color Accessibility**
- [ ] Text has sufficient contrast (≥4.5:1 ratio)
- [ ] Links are distinguishable from regular text
- [ ] Focus indicators are clearly visible
- [ ] Error states are perceivable by colorblind users

**Cross-Browser Testing**
- [ ] Colors display correctly in Chrome/Safari/Firefox
- [ ] Dark mode transitions smoothly
- [ ] CSS custom properties are supported

**Device Testing**
- [ ] Theme looks good on mobile devices
- [ ] Colors work with different screen brightness
- [ ] High-contrast mode compatibility

**Content Testing**
- [ ] Episode cards are readable
- [ ] Search results are clearly highlighted
- [ ] Transcript text has good contrast
- [ ] Navigation elements are visible

## 🔍 Troubleshooting

### Common Issues

**Colors Not Updating**
```bash
# Clear browser cache and restart dev server
pnpm client:dev
```

**Dark Mode Not Working**
- Check that you've defined colors for both `:root` and `.dark`
- Ensure dark mode variants have sufficient contrast

**Mobile Display Issues**
- Test on actual devices, not just browser dev tools
- Check that touch targets are large enough
- Verify text remains readable at mobile sizes

### CSS Debugging

Use browser dev tools to inspect color variables:

```css
/* Temporarily add for debugging */
body::before {
  content: "Primary: " var(--primary) " | Background: " var(--background);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  background: white;
  padding: 1rem;
}
```

## 🎨 Inspiration & Resources

### Color Palette Tools
- **Coolors.co**: Generate harmonious color schemes
- **Adobe Color**: Professional color wheel and palette generator
- **Paletton**: Advanced color scheme designer
- **Contrast Checker**: Ensure accessibility compliance

### Design Inspiration
- **Dribbble**: Search "podcast app" or "audio player"
- **UI Movement**: Modern interface design patterns
- **Collect UI**: Clean, minimal design examples
- **Page Flows**: User interface inspiration

### Accessibility Resources
- **WebAIM**: Color contrast checker
- **A11y Project**: Accessibility guidelines
- **Stark**: Figma plugin for accessibility testing

## 🚀 Advanced Features

### Custom Component Variants

Create themed components by extending the base system:

```css
/* Episode status indicators */
.episode-status--new {
  background: var(--primary);
  color: var(--primary-foreground);
}

.episode-status--popular {
  background: var(--secondary);
  color: var(--secondary-foreground);
}

/* Podcast category badges */
.category--technology {
  background: var(--accent);
  color: var(--accent-foreground);
}
```

### Animation Themes

Add subtle animations that match your brand:

```css
/* Smooth transitions */
* {
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* Hover effects */
.interactive-element:hover {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
```

---

**Next Step**: Once your theme is perfect, learn how to [deploy your site](./deployment-guide.md) to share it with the world!