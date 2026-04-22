#  The Migration Journe
Assess
The Assess phase is where AWS assesses the customer capabilities, readiness, and commitment to execute the migration. For more detail about the objectives and resources for this phase, see the Assess page of the Migration and Modernization Playbook.

When it comes to assessing the workloads of a customer who is running in Azure today, the best place to start is with the Cloud2AWS team. This team maintains a tool called CloudRays(resource-discovery-for-azure https://github.com/awslabs/resource-discovery-for-azure ), which takes a customer’s Azure environment and usage as inputs, analyzes them, and provides recommendations and mappings to AWS services, including Total Cost of Ownership (TCO). To start an assessment using CloudRays follow the instructions on the start an assessment wiki page. If the customer is a heavy user of Microsoft-specific technologies such as Windows or SQL Server, you can request additional support from the Microsoft Workloads team who focuses on this area.

resource-discovery-for-azure
https://github.com/awslabs/resource-discovery-for-azure

The CloudRays tool is able to map the most common services in an Azure environment to their AWS equivalents. However, there may be some PaaS services that require additional consideration. For help mapping these services from Azure to AWS, or to check for specific feature compatibility, you can look at the Market Intelligence Functionality Matrix.
Mobilize
The Mobilize phase is the bridge that takes the information obtained from the Assess phase to help the customer build the foundation for a successful journey. For more detail, visit the Mobilize page of the Migration and Modernization Playbook.

The Mobilize phase for an Azure-to-AWS migration is very similar to the mobilize phase for any other cloud migration. Customers should focus on laying the foundation for a successful AWS environment by creating a Landing Zone, a well-architected AWS environment, recommending training or resources like an Experienced Based Accelerator, and drafting the migration plan by understanding the workload mapping and application dependencies.
Migrate and Modernize
During the Migrate and Modernize phase customers execute and complete the migration based on the plan, budget and architectures defined during the Assess and Mobilize phases. For more detail, see the Migrate and Modernize page of the Migration and Modernization Playbook.

Depending on the level of resources required, the complexity of the migration, and the migration timeline, this phase can be led by different entities: the customer, a 3rd party partner, AWS ProServe, or a combination of these. AWS sellers and architects, though not directly involved in executing the migration activities, can share a variety of resources. The official AWS Blog has over 80 posts related to Azure, including details for migrating from specific Azure services to their AWS equivalents. Examples include the blog posts Migrate Delta tables from Azure Data Lake Storage to Amazon S3 using AWS Glue and Ingesting administrative logs from Microsoft Azure to AWS CloudTrail Lake. There are also a variety of 1st and 3rd party tools that can assist with the migration process, some of which are covered on the Migration and Modernization Highspot, such as the AWS Application Migration Service, AWS Database Migration Service, and the Porting Assistant for .NET.

# Mobilize your organization to accelerate large-scale migrations
Migrating hundreds or thousands of workloads requires coordination and implementation across multiple disciplines and teams. AWS approaches large-scale migrations in three phases: assess, mobilize, and migrate. Each phase builds on the previous one. This AWS Prescriptive Guidance strategy covers the assess phase and the mobilize phase. These phases set the foundation for accelerated migration at scale during the migrations phase.
please read all the doucment in below link, y
https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-migration/introduction.html
