declare module 'bootstrap/dist/js/bootstrap.bundle.min.js';

declare module 'japanese-holidays' {
	export function getHolidaysOf(year: number): Array<{
		month: number;
		date: number;
		name: string;
	}>;
}
