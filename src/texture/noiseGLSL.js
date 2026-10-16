// Value noise for the procedural fields (ground and paint). Sine-free hash
// with no visible lattice. Deterministic: no time, no randomness, no
// textures — the same input gives the same output on every GPU and at every
// export size.
export const NOISE_GLSL = `
float hash21( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
float fbm( vec2 p ) {
  float s = 0.0;
  float a = 0.5;
  for ( int i = 0; i < 4; i++ ) {
    s += a * vnoise( p );
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;
