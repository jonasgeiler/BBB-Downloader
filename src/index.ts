import { Command, flags } from '@oclif/command';
import { emptyDir, ensureDir, pathExists, readFile } from 'fs-extra';
import { resolve } from 'path';
import { DownloadManager } from './DownloadManager';
import xmlParser from 'fast-xml-parser';
import he from 'he';

class BbbDl extends Command {
	static description = 'Download a Big Blue Button meeting.';

	static flags = {
		help: flags.help({
			char:        'h',
			description: 'Show CLI help',
		}),

		outdir: flags.string({
			char:        'd',
			description: 'Specify output directory',
		}),
	};

	static args = [
		{
			name:        'url',
			description: 'Playback URL of a Big Blue Button meeting in the form of https://<website>/playback/presentation/2.3/<meeting-id>',
			required:    true,
		},
	];

	async run() {
		const { args, flags } = this.parse(BbbDl);
		const { url } = args;

		const matchResult = (/^(?<baseUrl>https?:\/\/.*)\/playback\/presentation\/2\.3\/(?<meetingId>[a-z0-9]{40}-[0-9]{13})/i).exec(url);

		if (!matchResult || !matchResult.groups?.baseUrl || !matchResult.groups?.meetingId) {
			this.error('Invalid URL or unsupported version!');
		}

		const { baseUrl, meetingId } = matchResult.groups;

		const prefixUrl = `${baseUrl}/presentation/${meetingId}`;

		const downloadFolder = flags.outdir ?? meetingId;
		const dataDownloadFolder = resolve(downloadFolder, 'data');
		const videosDownloadFolder = resolve(downloadFolder, 'videos');
		const slidesDownloadFolder = resolve(downloadFolder, 'slides');
		const textFilesDownloadFolder = resolve(downloadFolder, 'textfiles');

		await emptyDir(downloadFolder);
		await ensureDir(dataDownloadFolder);
		await ensureDir(videosDownloadFolder);
		await ensureDir(slidesDownloadFolder);
		await ensureDir(textFilesDownloadFolder);

		const downloadManager = new DownloadManager({
			fileConflictMode: DownloadManager.FileConflictMode.OVERWRITE,
		});

		downloadManager.setDownloadFolder(dataDownloadFolder);

		await downloadManager.downloadAll([
			`${prefixUrl}/presentation_text.json`,
			`${prefixUrl}/captions.json`,
			`${prefixUrl}/slides_new.xml`,
			`${prefixUrl}/cursor.xml`,
			`${prefixUrl}/metadata.xml`,
			`${prefixUrl}/panzooms.xml`,
			`${prefixUrl}/deskshare.xml`,
			`${prefixUrl}/notes.html`,
			`${prefixUrl}/polls.json`,
			`${prefixUrl}/external_videos.json`,
			`${prefixUrl}/shapes.svg`,
		]);

		downloadManager.setDownloadFolder(videosDownloadFolder);

		await downloadManager.downloadAll([
			`${prefixUrl}/video/webcams.webm`,
			`${prefixUrl}/video/webcams.mp4`,
			`${prefixUrl}/deskshare/deskshare.webm`,
		]);

		const shapesFile = resolve(dataDownloadFolder, 'shapes.svg');
		if (await pathExists(shapesFile)) {
			const rawShapesData = await readFile(shapesFile, 'utf8');
			const shapesData = this.parseXml(rawShapesData);

			let slideImages: string[] = [];
			let slideTextFiles: string[] = [];
			if (shapesData.svg?.image) {
				for (let image of shapesData.svg.image) {
					const imageUrl = `${prefixUrl}/${image.href}`;
					const textFileUrl = `${prefixUrl}/${image.text}`;

					if (image.href && !slideImages.includes(imageUrl)) slideImages.push(imageUrl);
					if (image.text && !slideTextFiles.includes(textFileUrl)) slideTextFiles.push(textFileUrl);
				}
			}

			downloadManager.setDownloadFolder(slidesDownloadFolder);
			await downloadManager.downloadAll(slideImages);

			downloadManager.setDownloadFolder(textFilesDownloadFolder);
			await downloadManager.downloadAll(slideTextFiles);
		}
	}

	parseXml(xml: string): any {
		return xmlParser.parse(xml, {
			attributeNamePrefix:    '',
			ignoreAttributes:       false,
			ignoreNameSpace:        true,
			allowBooleanAttributes: false,
			parseNodeValue:         true,
			parseAttributeValue:    true,
			trimValues:             true,
			parseTrueNumberOnly:    true,
			arrayMode:              tagName => [ 'image' ].includes(tagName),
			attrValueProcessor:     value => he.decode(value, { isAttributeValue: true }),
			tagValueProcessor:      value => he.decode(value),
		});
	}


}

export = BbbDl
