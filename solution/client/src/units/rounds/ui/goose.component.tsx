import { useState } from 'react';

import gussReady from '../../../assets/guss_ready.png';
import gussStop from '../../../assets/guss_stop.png';
import gussTapped from '../../../assets/guss_tapped.png';
import classes from './goose.module.css';

interface GooseProps {
  active: boolean;
  onTap: () => void;
}

/** Tappable while the round is active. Pressing shows the tapped goose; taps are not throttled. */
export function Goose({ active, onTap }: GooseProps) {
  const [pressed, setPressed] = useState(false);
  const image = !active ? gussStop : pressed ? gussTapped : gussReady;

  return (
    <button
      type="button"
      className={classes.goose}
      disabled={!active}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onTap}
      aria-label={active ? 'Тапнуть гуся' : 'Гусь недоступен'}
    >
      <img className={classes.image} src={image} alt="" draggable={false} />
    </button>
  );
}
