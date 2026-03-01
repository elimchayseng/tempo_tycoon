type Props = {
  annotations: string[];
};

export default function AnnotationBox({ annotations }: Props) {
  return (
    <div className="my-2 px-3 py-2.5 bg-indigo-950/40 border border-indigo-900/40 rounded-md text-sm leading-relaxed space-y-1">
      <div className="flex items-start gap-2">
        <span className="text-indigo-400 shrink-0 mt-0.5 text-xs">&#128161;</span>
        <div className="text-indigo-200/90 space-y-1">
          {annotations.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
