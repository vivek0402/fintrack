'use client';

import React from 'react';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
    return (
        <div style={{
            display: 'block',
            width,
            height,
            borderRadius,
            background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            flexShrink: 0,
            ...style,
        }} />
    );
}

export function SkeletonText({ style }: { style?: React.CSSProperties }) {
    return <Skeleton width="100%" height={14} borderRadius={4} style={style} />;
}

export function SkeletonTitle({ style }: { style?: React.CSSProperties }) {
    return <Skeleton width="60%" height={20} borderRadius={4} style={style} />;
}

export function SkeletonCard({ height, style }: { height?: string | number; style?: React.CSSProperties }) {
    return <Skeleton width="100%" height={height ?? 120} borderRadius={12} style={style} />;
}

export function SkeletonCircle({ size = 36, style }: { size?: number; style?: React.CSSProperties }) {
    return <Skeleton width={size} height={size} borderRadius="50%" style={style} />;
}

export function SkeletonButton({ style }: { style?: React.CSSProperties }) {
    return <Skeleton width={120} height={36} borderRadius={8} style={style} />;
}
