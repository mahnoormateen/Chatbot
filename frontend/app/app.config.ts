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

    /**
     * A hand pointing at anything that does something.
     *
     * The button theme only styles the disabled state, so an enabled
     * button keeps the arrow cursor and the page stops looking clickable.
     * Added to the base slot rather than to a single button because this is
     * the one affordance every button shares.
     *
     * It merges with the theme's own base slot rather than replacing it, so
     * "disabled:cursor-not-allowed" survives: that selector carries the
     * :disabled pseudo class and so still wins for a button that cannot be
     * pressed.
     */
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
  },
})