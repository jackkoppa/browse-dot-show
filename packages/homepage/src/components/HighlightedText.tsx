import { Highlight } from '@orama/highlight'

export interface HighlightedTextProps {
    text: string;
    searchStringToHighlight: string;
    className?: string;
}

export default function HighlightedText({
    text,
    searchStringToHighlight,
    className
}: HighlightedTextProps) {
    // Make the highlighted portion larger than the text itself, by expanding via margins & padding combo
    const highlighter = new Highlight({
        strategy: 'wholeWordMatch',
        CSSClass: `font-bold -mx-1.75 -my-0.75 px-1.75 py-0.75 bg-yellow-200/50`
    });

    const highlightedText = highlighter.highlight(text, searchStringToHighlight);
    return (
        // Requires trusting `@orama/highlight` to perform safe HTML rendering
        // https://github.com/oramasearch/highlight
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: highlightedText.HTML }}
        />
    )
} 