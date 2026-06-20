import { Fragment, cloneElement, type ReactElement, type ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
        }
        return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
    });
}

const BULLET_RE = /^\s*[-*]\s+/;
const NUMBERED_RE = /^\s*\d+\.\s+/;

export function renderChatMarkdown(content: string): ReactNode {
    const lines = content.split('\n');
    const blocks: ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            i++;
            continue;
        }

        if (BULLET_RE.test(line)) {
            const items: string[] = [];
            while (i < lines.length && BULLET_RE.test(lines[i])) {
                items.push(lines[i].replace(BULLET_RE, ''));
                i++;
            }
            blocks.push(
                <ul key={`b-${blocks.length}`} style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    {items.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: '2px' }}>{renderInline(item, `ul-${blocks.length}-${idx}`)}</li>
                    ))}
                </ul>
            );
            continue;
        }

        if (NUMBERED_RE.test(line)) {
            const items: string[] = [];
            while (i < lines.length && NUMBERED_RE.test(lines[i])) {
                items.push(lines[i].replace(NUMBERED_RE, ''));
                i++;
            }
            blocks.push(
                <ol key={`b-${blocks.length}`} style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    {items.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: '2px' }}>{renderInline(item, `ol-${blocks.length}-${idx}`)}</li>
                    ))}
                </ol>
            );
            continue;
        }

        const paraLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !BULLET_RE.test(lines[i]) && !NUMBERED_RE.test(lines[i])) {
            paraLines.push(lines[i]);
            i++;
        }
        blocks.push(
            <p key={`b-${blocks.length}`} style={{ margin: '0 0 8px' }}>
                {paraLines.map((l, idx) => (
                    <Fragment key={idx}>
                        {renderInline(l, `p-${blocks.length}-${idx}`)}
                        {idx < paraLines.length - 1 && <br />}
                    </Fragment>
                ))}
            </p>
        );
    }

    // Drop the trailing margin on the last block so it doesn't pad out the chat bubble.
    const trimmedBlocks = blocks.map((block, idx) => {
        if (idx !== blocks.length - 1) return block;
        const el = block as ReactElement<{ style?: React.CSSProperties }>;
        return cloneElement(el, { style: { ...el.props.style, marginBottom: 0 } });
    });

    return <>{trimmedBlocks}</>;
}
