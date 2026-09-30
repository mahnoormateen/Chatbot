/** Application wide defaults for the Nuxt UI component set.
 *
 * The keys under "ui" are merged into every component theme, so this is
 * the one place to change a default such as a color or a radius for the
 * whole app. Per instance overrides still win: a "color" prop, a "class",
 * or a "ui" object passed to a single component beats what is set here.
 */
export default defineAppConfig({
  ui: {
    /** The accent color and the neutral ramp. Every other color in the
     * palette is resolved by the color mode module from these two plus
     * the ones Nuxt UI ships with.
     */
    colors: {
      primary: 'orange',
      neutral: 'zinc',
    },
  },
})