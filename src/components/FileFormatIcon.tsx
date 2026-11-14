import React from 'react';

interface FileFormatIconProps {
  fileType: string;
  size?: 'sm' | 'md' | 'lg';
}

export function FileFormatIcon({ fileType, size = 'md' }: FileFormatIconProps) {
  const ext = (fileType || 'pdf').toLowerCase();

  let bg = 'bg-red-50 border-red-200 text-red-700';
  let label = 'PDF';

  if (ext === 'doc' || ext === 'docx') {
    bg = 'bg-blue-50 border-blue-200 text-blue-700';
    label = 'W';
  } else if (ext === 'xls' || ext === 'xlsx') {
    bg = 'bg-emerald-50 border-emerald-200 text-emerald-700';
    label = 'X';
  } else if (ext === 'ppt' || ext === 'pptx') {
    bg = 'bg-orange-50 border-orange-200 text-orange-700';
    label = 'P';
  }

  const sizeClass =
    size === 'sm'
      ? 'w-8 h-9 text-[10px]'
      : size === 'lg'
      ? 'w-11 h-12 text-xs'
      : 'w-9 h-10 text-[11px]';

  return (
    <div
      aria-label={`Định dạng ${ext.toUpperCase()}`}
      className={`shrink-0 rounded-md border flex flex-col items-center justify-center font-mono font-bold tracking-tight select-none ${bg} ${sizeClass}`}
    >
      <span>{label}</span>
      <span className="text-[8px] font-medium opacity-75 uppercase leading-none mt-0.5">
        {ext}
      </span>
    </div>
  );
}
