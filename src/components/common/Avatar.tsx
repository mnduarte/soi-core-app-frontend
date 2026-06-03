import { initialsOf, avatarColorFromId } from '../../lib/format';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  name: string;
  lastName?: string;
  id?: string;
  size?: Size;
  colorClass?: string;
}

export function Avatar({ name, lastName, id, size = 'md', colorClass }: AvatarProps) {
  const color = colorClass ?? (id ? avatarColorFromId(id) : 'color-4');
  return (
    <div className={`avatar avatar--${size} avatar--${color}`}>
      {initialsOf(name, lastName)}
    </div>
  );
}
