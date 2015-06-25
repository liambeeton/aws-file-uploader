// AWS Config
AWS.config.update({ accessKeyId: 'YOUR AWS PUBLIC KEY', secretAccessKey: 'YOUR AWS SECRET KEY' });
AWS.config.region = 'YOUR REGION';

// DOM Elements
var fileChooser = document.getElementById('file-chooser');
var endpointOption = document.getElementById('endpoint');
var bucketOption = document.getElementById('bucket');
var uploadTypeOption = document.getElementById('upload-type');
var button = document.getElementById('upload-button');

// S3 Upload options
var bucket = 'YOUR BUCKET';

// Upload properties
var startTime = new Date();
var partNum = 0;
var partSize = 1024 * 1024 * 5; // Minimum 5MB per chunk (except the last part) http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
var numPartsLeft = 0;
var maxUploadTries = 3;
var multipartMap = {
	Parts: []
};

function completeMultipartUpload(s3, doneParams) {
	s3.completeMultipartUpload(doneParams, function(err, data) {
		if (err) {
			console.log("An error occurred while completing the multipart upload");
			console.log(err);
		} else {
			var delta = (new Date() - startTime) / 1000;
			console.log("Completed upload in", delta, "seconds");
			console.log("Final upload data:", data);
		}
	});
}

function uploadPart(s3, multipart, partParams, tryNum) {
	var tryNum = tryNum || 1;

	s3.uploadPart(partParams, function(multiErr, mData) {
		if (multiErr) {
			console.log("multiErr, upload part error:", multiErr);
			if (tryNum < maxUploadTries) {
				console.log("Retrying upload of part: #", partParams.PartNumber)
				uploadPart(s3, multipart, partParams, tryNum + 1);
			} else {
				console.log("Failed uploading part: #", partParams.PartNumber)
			}
			return;
		}

		multipartMap.Parts[this.request.params.PartNumber - 1] = {
			ETag: mData.ETag,
			PartNumber: Number(this.request.params.PartNumber)
		};

		console.log("Completed part", this.request.params.PartNumber);
		console.log("Part data", mData);
		
		if (--numPartsLeft > 0) return; // complete only when all parts uploaded

		var doneParams = {
			Bucket: bucket,
			Key: partParams.Key,
			MultipartUpload: multipartMap,
			UploadId: multipart.UploadId
		};

		console.log("Completing upload...");

		completeMultipartUpload(s3, doneParams);
	});
}

button.addEventListener('click', function() {
	var file = fileChooser.files[0];

	if (file) {
		startTime = new Date();

		// Load selected bucket
		bucket = bucketOption.options[bucketOption.selectedIndex].text;

		console.log("Selected S3 bucket:", bucket);

		if (endpointOption.options[endpointOption.selectedIndex].text === 'CloudFront') {
			AWS.config.s3BucketEndpoint = true;
			AWS.config.endpoint = 'YOUR ENDPOINT';

			console.log("Uploading with CloudFront configuration...");
		}

		// S3 Object
		var s3 = new AWS.S3({ params: { Bucket: bucket } });

		if (uploadTypeOption.options[uploadTypeOption.selectedIndex].text === 'Single') {
			var params = { Key: file.name, ContentType: file.type, Body: file };

			// Singlepart
			console.log("Creating singlepart upload for:", file.name);

			s3.upload(params, function(err, data) {
				if (err) {
					console.log("An error occurred while completing the singlepart upload");
					console.log(err);

					return;
				}

				var delta = (new Date() - startTime) / 1000;
				console.log("Completed upload in", delta, "seconds");
				console.log("Final upload data:", data);
    		});
		} else {
			// Reset global vars for new multipart upload
			partNum = 0;
			numPartsLeft = Math.ceil(file.size / partSize);
			multipartMap = { Parts: [] };

			var multiPartParams = { Key: file.name, ContentType: file.type, Bucket: bucket };
			
			// Multipart
			console.log("Creating multipart upload for:", file.name);

			s3.createMultipartUpload(multiPartParams, function(mpErr, multipart) {
				if (mpErr) { console.log("Error!", mpErr); return; }

				console.log("Got upload ID", multipart.UploadId);

				// Grab each partSize chunk and upload it as a part
				for (var rangeStart = 0; rangeStart < file.size; rangeStart += partSize) {
					partNum++;
					
					var end = Math.min(rangeStart + partSize, file.size),
					
					partParams = {
						Body: file.slice(rangeStart, end),
						Bucket: bucket,
						Key: file.name,
						PartNumber: String(partNum),
						UploadId: multipart.UploadId
					};

					// Send a single part
					console.log("Uploading part: #", partParams.PartNumber, ", Range start:", rangeStart);

					uploadPart(s3, multipart, partParams);
				}
			});
		}
	}
}, false);