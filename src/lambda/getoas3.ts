import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { APIGateway } from 'aws-sdk';
import { GetExportRequest } from 'aws-sdk/clients/apigateway';

export const handler: APIGatewayProxyHandlerV2 = (event, context, callback) => {
    const getExportParams: GetExportRequest = {
        restApiId: process.env.restApiId as string,
        stageName: process.env.stage as string,
        exportType: 'oas30',
        parameters: {
            extensions: 'documentation'
        }
    }
    const client = new APIGateway({ region: 'eu-west-1' });

    client.getExport(getExportParams, (err, data) => {
        if (err) callback(err);
        callback(null, {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: Buffer.from(<Buffer>data.body).toString('utf8')
        })
    })
}

export default handler;
