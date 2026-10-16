"use client";
import { useMemo, useState } from 'react';
import type { BuildSentence } from '@/lib/study-training';

type Tile = { id: number; word: string };

function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Duolingo-style sentence building: a Chinese cue, tap word tiles to assemble
 * the English sentence, press 检查 to see an immediate correct/incorrect verdict.
 * Self-assessment (the rating buttons) stays the source of truth for scheduling.
 */
export function SentenceBuild({ sentences, disabled = false, onAllDone }: {
    sentences: BuildSentence[];
    disabled?: boolean;
    onAllDone: (builtText: string) => void;
}) {
    const [index, setIndex] = useState(0);
    const [picked, setPicked] = useState<number[]>([]);
    const [checked, setChecked] = useState<null | boolean>(null);
    const [built, setBuilt] = useState<string[]>([]);

    const sentence = sentences[index];
    // Shuffle once per sentence (keyed by index+answer) so tiles don't jump
    // while the user taps.
    const tiles: Tile[] = useMemo(() => {
        if (!sentence) return [];
        const withIds = sentence.tokens.map((word, id) => ({ id, word }));
        // Avoid an already-solved order for short sentences.
        const shuffled = shuffle(withIds);
        if (shuffled.length > 1 && shuffled.every((t, i) => t.word === sentence.tokens[i])) {
            [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
        }
        return shuffled;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, sentence?.answer]);

    if (!sentence) return null;
    const usedIds = new Set(picked);
    const assembled = picked.map(id => tiles.find(t => t.id === id)?.word ?? '').join(' ');

    function tap(tile: Tile) {
        if (disabled || checked !== null) return;
        setPicked(prev => [...prev, tile.id]);
    }
    function undo() {
        if (disabled || checked !== null) return;
        setPicked(prev => prev.slice(0, -1));
    }
    function check() {
        const correct = assembled.trim() === sentence.answer.trim();
        setChecked(correct);
        setBuilt(prev => [...prev, assembled]);
    }
    function next() {
        if (index + 1 < sentences.length) {
            setIndex(index + 1);
            setPicked([]);
            setChecked(null);
        } else {
            onAllDone(built.join('\n'));
        }
    }

    return <div className="sb-wrap" data-testid="sentence-build">
        <p className="sb-progress">第 {index + 1} / {sentences.length} 句</p>
        <p className="sb-cue" data-testid="sb-cue">{sentence.prompt || '拼出下面的英文句子。'}</p>
        <div className={`sb-answer ${checked === true ? 'ok' : checked === false ? 'bad' : ''}`} data-testid="sb-answer">
            {picked.length ? picked.map(id => tiles.find(t => t.id === id)?.word).join(' ') : <span className="sb-placeholder">点下面的词块组成英文句子</span>}
        </div>
        {checked !== null && <p className={`sb-verdict ${checked ? 'ok' : 'bad'}`} role="status" data-testid="sb-verdict">
            {checked ? '✅ 正确！' : `❌ 再想想。参考答案：${sentence.answer}`}
        </p>}
        <div className="sb-tiles">
            {tiles.map(tile => <button key={tile.id} type="button" className="sb-tile" data-testid="sb-tile" disabled={disabled || usedIds.has(tile.id) || checked !== null} onClick={() => tap(tile)}>{tile.word}</button>)}
        </div>
        <div className="sb-actions">
            {checked === null
                ? <><button type="button" className="study-ghost" disabled={disabled || !picked.length} onClick={undo}>撤销</button>
                    <button type="button" className="study-primary" data-testid="sb-check" disabled={disabled || !picked.length} onClick={check}>检查</button></>
                : <button type="button" className="study-primary" data-testid="sb-next" onClick={next}>{index + 1 < sentences.length ? '下一句' : '完成，去评分'}</button>}
        </div>
    </div>;
}
