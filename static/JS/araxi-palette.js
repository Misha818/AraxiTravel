/*
 * Araxi Travel colours (taken from the logo; the same values as the variables in
 * static/css/landing.css), offered first in every text-colour picker of the staff pages:
 * Pickr swatches (Add/Edit Slide, Send Email, Product) and Quill's own colour dropdown
 * (Transfer Funds). 14 colours = two rows of Quill's 7-column colour grid.
 */
window.ARAXI_PALETTE = [
    '#ffffff',  // white
    '#f8f5ed',  // --cream-100
    '#ecdcc4',  // --sand-200
    '#ddbf98',  // --sand-300
    '#c59054',  // --ochre-500
    '#a9733a',  // --ochre-600
    '#7b8893',  // --ink-400
    '#b5d8e3',  // --river-200
    '#4596b2',  // --river-400
    '#15698a',  // --river-600
    '#0c4464',  // --navy-700
    '#072339',  // --navy-900
    '#0e2233',  // --ink-900
    '#4a5b69'   // --ink-600
];

// Quill's colour dropdown: the Araxi colours, then Quill's default colours (kept as before).
window.ARAXI_QUILL_COLORS = window.ARAXI_PALETTE.concat([
    '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
    '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff',
    '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff',
    '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24b2',
    '#444444', '#5c0000', '#663d00', '#666600', '#003700', '#002966', '#3d1466'
]);
