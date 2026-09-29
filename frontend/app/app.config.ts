/** Application wide defaults for the Nuxt UI component set.
 *
 * The keys under "ui" are merged into every component theme, so this is
 * the one place to change a default such as a colour or a radius for the
 * whole app. Per instance overrides still win: a "color" prop, a "class",
 * or a "ui" object passed to a single component beats what is set here.
 */
export default defineAppConfig({
  ui: {
    /** The accent colour and the neutral ramp. Every other colour in the
     * palette is resolved by the colour mode module from these two plus
     * the ones Nuxt UI ships with.
     */
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
  },
})