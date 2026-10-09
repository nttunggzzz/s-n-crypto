import { toLocalISOString } from '../utils/timezone';

const t = new Date('2026-08-29T15:00:00Z');
console.log(toLocalISOString(t));
if (toLocalISOString(t) === '2026-08-29T22:00:00+07:00') {
  console.log("Timezone verified!");
} else {
  console.log("Timezone test failed!");
}
