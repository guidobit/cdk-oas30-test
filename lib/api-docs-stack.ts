import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    CfnDocumentationPart,
    CfnDocumentationVersion,
    Cors,
    IdentitySource,
    JsonSchemaType,
    JsonSchemaVersion,
    LambdaIntegration,
    MockIntegration,
    RequestAuthorizer,
    Resource,
    RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as Path from 'path';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class ApiDocsStack extends cdk.Stack {
    private api: RestApi;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.api = this.createApi();
        const authorizer = this.authorizer();
        const todoRoute = this.todoRoute(authorizer);
        this.todoItemRoute(todoRoute);
        this.apiDocsRoute();
    }

    private createApi() {
        const now = new Date();
        const documentationVersion = `${now.getTime()}`
        const api = new RestApi(this, 'api', {
            defaultIntegration: new MockIntegration(),
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS,
                allowMethods: Cors.ALL_METHODS,
                allowHeaders: Cors.DEFAULT_HEADERS,
                disableCache: true,
            },
            deployOptions: {
                description: `Description of deployment at ${now.toISOString()}`
            },
            description: 'Blabla description',
        });


        // This will create a documentation version each time, but you have to manually associate it with api gateway.
        new CfnDocumentationVersion(this, 'brute-force-docs-version', {
            restApiId: api.restApiId,
            documentationVersion,
            description: `Documentation generated at ${now.toISOString()}`,
        });

        new CfnDocumentationPart(this, 'api-docs', {
            location: {
                type: 'API',
            },
            restApiId: api.restApiId,
            properties: JSON.stringify({
                /** https://swagger.io/specification/#info-object **/
                info: {
                    title: 'A custom title',
                    description: `Documentation description generated at ${now.toISOString()}`,
                    summary: `Documentation summary generated at ${now.toISOString()}`,
                    license: {
                        name: 'MIT',
                        url: 'https://opensource.org/licenses/MIT',
                    },
                    contact: {
                        name: 'Some person',
                        email: 'example@example.com',
                        url: 'https://example.com'
                    }
                }
            }),
        });

        return api;
    }

    private authorizer() {
        new CfnDocumentationPart(this, 'some-request-authorizer-doc', {
            location: {
                type: 'AUTHORIZER',
                name: 'SomeAuthorizer',
            },
            restApiId: this.api.restApiId,
            properties: JSON.stringify({
                summary: 'Some authorizer summary',
                description: 'Some authorizer description',
                schema: {
                    type: JsonSchemaType.STRING,
                    format: 'uuid',
                    example: '10c89c8b-fb09-430d-bfc3-3138736598bf',
                },
            }),
        });

        return new RequestAuthorizer(this, 'some-request-authorizer', {
            handler: new NodejsFunction(this, 'some-authorizer-function', {
                entry: Path.resolve('src/lambda/getoas3.ts'), // Not used so care-bear that its not an authorizer...
                handler: 'default',
            }),
            authorizerName: 'SomeAuthorizer',
            identitySources: [IdentitySource.header('Authorization')],
            resultsCacheTtl: Duration.seconds(0),
        });
    }

    private apiDocsRoute() {
        // https://dekq8mivw9.execute-api.eu-west-1.amazonaws.com/prod/api-docs/api-docs.json
        const apiDocsRoute = this.api.root.addResource('api-docs');
        const oas3Route = apiDocsRoute.addResource('api-docs.json');
        this.getOas3Spec(oas3Route);
    }

    private todoItemRoute(todoRoute: Resource) {
        const todoItemRoute = todoRoute.addResource('{todoId}');
        new CfnDocumentationPart(this, 'todoIdDocs', {
            location: {
                type: 'PATH_PARAMETER',
                name: 'todoId',
                path: todoRoute.path,
                method: 'GET',
            },
            restApiId: this.api.restApiId,
            properties: JSON.stringify({
                description: 'The id of the todo',
                format: 'uuid',
                example: '01d64dee-e83d-4d26-b15a-5a1cd072b666',
                summary: 'Sommary of the id of the todo',
                schema: {
                    type: JsonSchemaType.STRING,
                    format: 'uuid',
                    example: '3908c6bb-941a-4c35-9a45-c6034006e8c5',
                },
            }),
        })
        this.getTodoById(todoItemRoute);
    }

    private todoRoute(authorizer: RequestAuthorizer) {
        const todoRoute = this.api.root.addResource('todo');
        this.createTodo(todoRoute);
        this.listTodos(todoRoute, authorizer);

        return todoRoute;
    }

    private listTodos(todoRoute: Resource, authorizer: RequestAuthorizer) {
        todoRoute.addMethod('GET', undefined, {
            operationName: 'ListTodos',
            requestParameters: {
                'method.request.header.Authorization': true,
            },
            methodResponses: [
                {
                    statusCode: '200',
                    responseModels: {
                        'application/json': this.api.addModel('ListTodosResult', {
                            contentType: 'application/json',
                            schema: {
                                schema: JsonSchemaVersion.DRAFT4,
                                title: 'ListTodosResult',
                                type: JsonSchemaType.ARRAY,
                                items: {
                                    type: JsonSchemaType.OBJECT,
                                    properties: {
                                        todoId: { type: JsonSchemaType.STRING, format: 'uuid' },
                                        createdAt: { type: JsonSchemaType.STRING, format: 'date' },
                                    },
                                },
                            },
                        }),
                    },
                },
            ],
            authorizer,
        });
        new CfnDocumentationPart(this, 'ListTodo.Header.Authorization', {
            location: {
                type: 'REQUEST_HEADER',
                method: 'GET',
                path: todoRoute.path,
                name: 'Authorization'
            },
            restApiId: this.api.restApiId,
            properties: JSON.stringify({
                description: 'Authorization header description',
                summary: 'Authorization header summary',
                'x-description': 'Authorization header x-description',
                'x-summary': 'Authorization header x-summary',
            }),
        })
    }

    private getTodoById(todoItemRoute: Resource) {
        todoItemRoute.addMethod('GET', undefined, {
            operationName: 'GetTodoById',
            methodResponses: [
                {
                    statusCode: '200',
                    responseModels: {
                        'application/json': this.api.addModel('GetTodoByIdResult', {
                            contentType: 'application/json',
                            schema: {
                                schema: JsonSchemaVersion.DRAFT4,
                                title: 'GetTodoByIdResult',
                                type: JsonSchemaType.OBJECT,
                                properties: {
                                    todoId: { type: JsonSchemaType.STRING, format: 'uuid' },
                                    title: { type: JsonSchemaType.STRING },
                                    body: { type: JsonSchemaType.STRING },
                                    status: { type: JsonSchemaType.STRING },
                                    createdAt: { type: JsonSchemaType.STRING, format: 'date' },
                                },
                            },
                        }),
                    },
                },
            ],
        });
    }

    private createTodo(todoRoute: Resource) {
        todoRoute.addMethod('POST', undefined, {
            operationName: 'CreateTodo',
            requestModels: {
                'application/json': this.api.addModel('CreateTodo', {
                    contentType: 'application/json',
                    schema: {
                        schema: JsonSchemaVersion.DRAFT4,
                        title: 'CreateTodo',
                        type: JsonSchemaType.OBJECT,
                        properties: {
                            title: { type: JsonSchemaType.STRING },
                            body: { type: JsonSchemaType.STRING },
                        },
                    },
                }),
            },
            methodResponses: [
                {
                    statusCode: '200',
                    responseModels: {
                        'application/json': this.api.addModel('CreateTodoResult', {
                            contentType: 'application/json',
                            schema: {
                                schema: JsonSchemaVersion.DRAFT4,
                                title: 'CreateTodoResult',
                                type: JsonSchemaType.OBJECT,
                                properties: {
                                    todoId: { type: JsonSchemaType.STRING, format: 'uuid' },
                                },
                            },
                        }),
                    },
                },
            ],
        });
    }

    private getOas3Spec(oas3Route: Resource) {
        const getOas3 = new NodejsFunction(this, 'getOas3', {
            environment: {
                restApiId: 'dekq8mivw9',
                stage: 'prod',
                extensions: 'apigateway',
            },
            handler: 'default',
            entry: Path.resolve('src/lambda/getoas3.ts'),
        });
        getOas3.addToRolePolicy(new PolicyStatement({
            sid: 'AllowApiGatewayGet',
            actions: ['apigateway:GET'],
            effect: Effect.ALLOW,
            resources: ['*'],
        }));
        const getOas3Integration = new LambdaIntegration(getOas3, {
            integrationResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': `'*'`,
                    }
                }
            ]
        });
        oas3Route.addMethod('GET', getOas3Integration, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseModels: {},
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    }
                }
            ],
        });
    }
}
