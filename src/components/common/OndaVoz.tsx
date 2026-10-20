/**
 * Onda que se mueve con la voz.
 *
 * Son dos señales distintas en una sola figura, y por eso están separadas:
 *
 *  · La FORMA la da la animación. Cada barra late con su propio retardo, así
 *    que la onda se mueve aunque estés callado: dice "sigo escuchando".
 *  · La ALTURA la da tu voz. `useNivelVoz` escribe `--nivel` en algún ancestro
 *    y las barras la leen: dice "te oigo a vos, ahora".
 *
 * Si la animación dependiera del nivel, en silencio se congelaría y parecería
 * colgada. Si solo hubiera animación, se movería igual aunque el micrófono no
 * estuviera captando nada — que es exactamente la mentira que hay que evitar.
 *
 * No mide nada por su cuenta: quien la usa monta `useNivelVoz` sobre un
 * contenedor y las variables CSS bajan solas.
 */

interface Props {
  /** Mientras es false ocupa cero alto y no se ve. */
  activa: boolean;
  /** `chica` para una barra de estado; `grande` para la hoja de dictado. */
  tam?: 'chica' | 'grande';
}

export function OndaVoz({ activa, tam = 'grande' }: Props) {
  return (
    <span
      className={`onda onda--${tam}${activa ? ' is-on' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

export default OndaVoz;
