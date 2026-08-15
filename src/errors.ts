// A single typed error for every provider failure, so hosts can branch on a
// stable `code` instead of matching message strings.
export class AwsProviderError extends Error {
	code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = 'AwsProviderError';
		this.code = code;
	}
}
