import { Presets, SingleBar } from 'cli-progress';
import { DownloaderHelper as Downloader, DownloaderHelperOptions as DownloaderOptions } from 'node-downloader-helper';
import { basename } from 'path';

export class DownloadManager {

	protected downloadFolder: string;
	protected fileConflictMode: DownloadManager.FileConflictMode;
	protected onError: DownloadManager.ErrorHandler;

	constructor(options: DownloadManager.Options) {
		this.downloadFolder = options.downloadFolder ?? process.cwd();
		this.fileConflictMode = options.fileConflictMode ?? DownloadManager.FileConflictMode.MAKE_UNIQUE;
		this.onError = options.onError;
	}

	public setDownloadFolder(newDownloadFolder: string) {
		this.downloadFolder = newDownloadFolder;
	}

	public async download(url: string): Promise<void> {
		let downloaderOptions: DownloaderOptions = {
			retry: {
				maxRetries: 10,
				delay:      5000,
			},
		};

		switch (this.fileConflictMode) {
			case DownloadManager.FileConflictMode.MAKE_UNIQUE:
				downloaderOptions.override = false;
				break;

			case DownloadManager.FileConflictMode.OVERWRITE:
				downloaderOptions.override = true;
				break;

			case DownloadManager.FileConflictMode.SKIP:
				downloaderOptions.override = {
					skip:        true,
					skipSmaller: true,
				};
				break;

			case DownloadManager.FileConflictMode.SKIP_UNLESS_SMALLER:
				downloaderOptions.override = {
					skip:        true,
					skipSmaller: false,
				};
				break;
		}

		const downloader = new Downloader(url, this.downloadFolder, downloaderOptions);
		const progress = new SingleBar({
			format:         '{bar} {percentage}% (ETA: {eta_formatted}) | {name}',
			hideCursor:     true,
			stopOnComplete: true,
			autopadding:    true,
		}, Presets.shades_classic);

		progress.start(100, 0, {
			...downloader.getStats(),
			name: basename(url),
		});

		downloader.on('progress', stats => {
			progress.update(stats.progress, stats);
		});

		downloader.on('error', () => {
			progress.stop();
		});

		downloader.on('end', () => {
			progress.stop();
		});

		await downloader
			.start()
			.catch(error => {
				if (this.onError) this.onError(error);
			});
	}

	public async downloadAll(urls: string[]) {
		for (let url of urls) {
			await this.download(url);
		}
	}

}

export namespace DownloadManager {

	export interface Options {
		downloadFolder?: string;
		fileConflictMode?: FileConflictMode;
		onError?: ErrorHandler;
	}

	export enum FileConflictMode {
		MAKE_UNIQUE,
		OVERWRITE,
		SKIP,
		SKIP_UNLESS_SMALLER,
	}

	export type ErrorHandler = (error: Error) => void;

}
