import { useParams } from 'react-router';

import { RoundPage } from '../pages/round/round.page';

/** A new key per round id resets the page state (e.g. the tap score) without an effect. */
export function RoundRoute() {
  const { id } = useParams();
  return <RoundPage key={id} />;
}
